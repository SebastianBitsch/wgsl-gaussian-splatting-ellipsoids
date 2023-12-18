const BYTES_PER_PROPERTY = 4; // just assume everything is 4 bytes... hopefully no issues

String.prototype.Count = function (find) {
    return this.split(find).length - 1;
}

// indexOfAll shamelessly stolen from: https://stackoverflow.com/a/52984577
const indexOfAll = (arr, val) => arr.reduce((acc, el, i) => (el === val ? [...acc, i] : acc), []);

const pad = (num) => num - (num % 4) + (4 * (num % 4 != 0));

function splitHeaderAndBody(fileBuffer) {
    // Create a Uint8Array from the ArrayBuffer for random access ease of use
    const fileArray = new Uint8Array(fileBuffer);

    // String to identify the end of the header
    const endHeaderBytes = new TextEncoder().encode("end_header\n");

    // Find the position where the header ends
    var endHeaderPosition = null;
    for (var i = 0; i < fileArray.length - endHeaderBytes.length; i++) {
        let match = true;
        for (let j = 0; j < endHeaderBytes.length; j++) {

            // Check that every byte matches the end_header tag, if they dont break and look at next 
            if (fileArray[i + j] !== endHeaderBytes[j]) {
                match = false;
                break;
            }
        }
        if (match) {
            endHeaderPosition = i + endHeaderBytes.length;
            break;
        }
    }

    // Sanity check, bad file
    if (!endHeaderPosition) {
        throw new Error('End of header not found, bad .ply file');
    }

    // Extract the header
    const headerBuffer = fileBuffer.slice(0, endHeaderPosition);
    const headerString = new TextDecoder('utf-8').decode(headerBuffer);

    // Extract the binary body
    const bodyBuffer = fileBuffer.slice(endHeaderPosition);

    // Return the header string and the body ArrayBuffer
    // return {
    //     header: headerString,
    //     body: bodyBuffer
    // };
    return [headerString, bodyBuffer];
}

function rearrangeRGB(rrggbb) {
    // Change the ordering of an array, there is probably a slicker way of doing this
    // [r r r ... g g g ... b b b] -> [r g b r g b r g b ...]
    const rgbrgb = [];

    for (let i = 0; i < rrggbb.length / 3; i++) {
        rgbrgb.push(rrggbb[i]);              // R
        rgbrgb.push(rrggbb[i + length]);     // G
        rgbrgb.push(rrggbb[i + 2 * length]); // B
    }

    return rgbrgb;
}

/**Function for parsing a (kinda specific) kind of .ply header to extract some info used to 
 * read the rest of the file
 *  
 * @param {*} headerString the raw string of the header
 * @param {*} maxVerts the max number of vertices to read - some files are trillions, we cant read that many sadly
 * @returns 
 */
function parseHeader(headerString, maxVerts = 500000) {
    let headerArray = headerString.split("\n");

    let nVertices = parseInt(headerArray.find(e => e.includes("element vertex")).split(" ")[2]); // TODO: not the most elegant solution
    nVertices = Math.min(nVertices, maxVerts);

    let properties = headerArray.filter(e => e.includes("property"));

    // TODO: all this could be a single for loop but..
    let shPropertyIndices = properties.flatMap((text, i) => text.includes("f_") ? i : []);
    let vertexPropertyIndices = properties.flatMap((text, i) => !text.includes("f_") ? i : []);
    
    return {
        nVertices           : nVertices,
        nProperties         : properties.length,
        propertyNames       : properties, // TODO: could do everything with this tbh
        // nShCoeffs           : nShCoeffs,
        shPropertyIndices   : shPropertyIndices,
        vertexPropertyIndices : vertexPropertyIndices
    }
}

function Sigmoid(z) {
    return 1 / (1 + Math.exp(-z));
}

function DiagonalMatrix3d(v) {
    return mat3([
        v[0], 0,    0,
        0,    v[1], 0,
        0,    0,    v[2]
    ]);
}

function Quaternion2RotMatrix(q) {
    // See: "Quaternion-derived rotation matrix" https://en.wikipedia.org/wiki/Quaternions_and_spatial_rotation 
    let xx = q[0] * q[0];
    let yy = q[1] * q[1];
    let zz = q[2] * q[2];
    let xy = q[0] * q[1];
    let xz = q[0] * q[2];
    let yz = q[1] * q[2];
    let wx = q[3] * q[0];
    let wy = q[3] * q[1];
    let wz = q[3] * q[2];

    return mat3([
        1.0 - 2.0 * (yy + zz), 2.0 * (xy - wz), 2.0 * (xz + wy),
        2.0 * (xy + wz), 1.0 - 2.0 * (xx + zz), 2.0 * (yz - wx),
        2.0 * (xz - wy), 2.0 * (yz + wx), 1.0 - 2.0 * (xx + yy)
    ]);
}

function getPrincipalAxes(scaleVector, rotationQuaternion) {
    // https://en.wikipedia.org/wiki/Ellipsoid see "principal axes"
    // Unrotated axes
    let r1 = [scaleVector[0], 0, 0];
    let r2 = [0, scaleVector[1], 0];
    let r3 = [0, 0, scaleVector[2]];

    // Rotated axes
    let rotatedR1 = rotateVector(rotationQuaternion, r1);
    let rotatedR2 = rotateVector(rotationQuaternion, r2);
    let rotatedR3 = rotateVector(rotationQuaternion, r3);

    return {
        r1: rotatedR1,
        r2: rotatedR2,
        r3: rotatedR3
    };
}

function rotateVector(quaternion, vector) {
    let rotationMatrix = Quaternion2RotMatrix(quaternion);
    return mult(rotationMatrix, vector);
}

function CalculateEllipsoidBounds(positionVector, scaleVector, rotationVector) {
    P = getPrincipalAxes(scaleVector, rotationVector);
    
    // https://math.stackexchange.com/a/2348806
    x = Math.sqrt(P.r1[0]*P.r1[0] + P.r1[1]*P.r1[1] + P.r1[2]*P.r1[2]);
    y = Math.sqrt(P.r2[0]*P.r2[0] + P.r2[1]*P.r2[1] + P.r2[2]*P.r2[2]);
    z = Math.sqrt(P.r3[0]*P.r3[0] + P.r3[1]*P.r3[1] + P.r3[2]*P.r3[2]);

    xmin = positionVector[0] - x;
    xmax = positionVector[0] + x;
    ymin = positionVector[1] - y;
    ymax = positionVector[1] + y;
    zmin = positionVector[2] - z;
    zmax = positionVector[2] + z;

    return {
        min: [xmin, ymin, zmin],
        max: [xmax, ymax, zmax]
    }
}

function TransformationMatrix(scaleVector, rotationVector) {
    let S = DiagonalMatrix3d(scaleVector); // 3x3 diagonal matrix
    let R = Quaternion2RotMatrix(rotationVector); // ROtation matrix
    return mult(R,S);
}

function CovarianceMatrix3d(scaleVector, rotationVector) {
    let S = DiagonalMatrix3d(scaleVector); // 3x3 diagonal matrix
    let R = Quaternion2RotMatrix(rotationVector);

    return mult(mult(mult(R, S), transpose(S)), transpose(R));
}

function InvCovarianceMatrix3d(scaleVector, rotationVector) {
    return inverse(CovarianceMatrix3d(scaleVector, rotationVector));
}

function AddFourthDimension(array) {
    // Function to go from [1,2,3,4,5,6,7,8,9] -> [1,2,3,0,4,5,6,0,7,8,9,0]
    var out = new Float32Array(pad(array.length + 1));
    var offset = 0;
    for (let i = 0; i < array.length; i++) {
        if (i % 3 == 0 && 0 < i) {
            offset += 1;
        }
        out[i + offset] = array[i];
    }
    return out;    
}

function parseBody(header, bodyBuffer) {
    // NB TODO: I think there can also be uint8's - not just floats so maybe have to change this everything will break if not floats
    const vertexSize = header.nProperties * BYTES_PER_PROPERTY;

    // Float32Arrays to store the vertices 
    const vertices = new Float32Array(header.nVertices * pad(header.vertexPropertyIndices.length));
    const vertexPositions = [];
    const sphericalHarmonics = new Float32Array(header.nVertices * 64); 
    const invCovMatrices = new Float32Array(header.nVertices * pad(9)); // Cotains 3x3 matrices 

    var n = 0; // n_vertices

    // Parse the vertices, split on whether they are are vertex data or sh data
    for (let i = 0; i < header.nVertices; i++) {
        let vertexSlice = new Float32Array(bodyBuffer, i * vertexSize, header.nProperties);
        var rotation = [];
        var scale = [];
        var position = [];
        var normal = [];
        var opacity = 1.0;
        
        for (let j = 0; j < header.nProperties; j++) {

            // x,y,z,nx,ny,nz,opacity,scale,rot
            if (header.vertexPropertyIndices.includes(j)) {
                if (header.propertyNames[j].includes("float x") || header.propertyNames[j].includes("float y") || header.propertyNames[j].includes("float z")) {
                    position.push(vertexSlice[j]);
                }
                if (header.propertyNames[j].includes('scale_')) {
                    vertexSlice[j] = Math.exp(vertexSlice[j]);
                    scale.push(vertexSlice[j]);
                }
                if (header.propertyNames[j].includes('opacity')) {
                    opacity = Sigmoid(vertexSlice[j]);
                }
                if (header.propertyNames[j].includes('rot_')) {
                    rotation.push(vertexSlice[j]);
                }
                if (header.propertyNames[j].includes("float nx") || header.propertyNames[j].includes("float ny") || header.propertyNames[j].includes("float nz")) {
                    normal.push(vertexSlice[j]);
                }
            }
        }
        // Remove small vertices, i.e. they are too thin or just tiny
        let eps = 0.001;
        if (scale[0] < eps || scale[1] < eps || scale[2] < eps) {
            continue;
        }

        // Add padding
        position.push(0);
        scale.push(0);
        normal.push(opacity);
        
        vertices.set(position,      n * 16);
        vertices.set(scale,     4 + n * 16);
        vertices.set(rotation,  8 + n * 16);
        vertices.set(normal,   12 + n * 16);
        vertexPositions.push(position.slice(0,3));
        invCovMatrices.set(AddFourthDimension(flatten(InvCovarianceMatrix3d(scale, rotation))), n * pad(9));

        // TODO: This not exactly nice, and should be cleaned up
        // Set the first set of spherical harmonics
        sphericalHarmonics.set(
            AddFourthDimension([
                vertexSlice[header.shPropertyIndices[0]],
                vertexSlice[header.shPropertyIndices[1]],
                vertexSlice[header.shPropertyIndices[2]],
            ]), n * 64
        );
        for (let k = 0; k < 15; ++k) {
            let sh = [0,0,0];
            for (let rgb = 0; rgb < 3; ++rgb) {
                sh[rgb] = vertexSlice[header.shPropertyIndices[rgb * 15 + k + 3]];
            }
            sphericalHarmonics.set(
                AddFourthDimension(sh), 4 + (k*4) + (n * 64)
            );
        }
        n += 1;
    }
    console.log("n vertices: ", n);
    return {
        n_vertices: n,
        vertices : vertices,
        vertexPositions: vertexPositions,
        sphericalHarmonics : sphericalHarmonics,
        invCovMatrices : invCovMatrices
    };
}

function rearrangeArray(floatArray, indexArray) {
    let rearrangedArray = new Float32Array(floatArray.length);

    for (let i = 0; i < indexArray.length; i++) {
        rearrangedArray[i] = floatArray[indexArray[i]];
    }

    return rearrangedArray;
}

function sortByDistanceTo(vertexPositions, refPoint) {
    // Sort vertices by distance to some point (camera) - speed not great
    refPoint = refPoint.slice(0,3); // can be a vec4 - the camera is
    return vertexPositions.sort(function(a, b) {
        if (a === b) { return 0; }
        return length(subtract(a, refPoint)) < length(subtract(b, refPoint)) ? -1 : 1;
    });
}

function argSortByDistanceTo(vertexPositions, refPoint) {
    // Return the indices in order of closest to refpoint (camera)
    refPoint = refPoint.slice(0,3); // can be a vec4 - the camera is
    return new Uint32Array( 
        Array.from(vertexPositions.keys()).sort(
            (a,b) => length(subtract(vertexPositions[a], refPoint)) < length(subtract(vertexPositions[b], refPoint)) ? -1 : 1
        )
    );
}


function readFile(fileName, callback) {
    var request = new XMLHttpRequest(); 
    request.open('GET', fileName, true); // Create a request to get file 

    // reading as arraybuffer
    request.responseType = 'arraybuffer';

    request.onreadystatechange = function() {
        if (request.readyState === 4 && request.status !== 404 && typeof(callback) == "function") {
            callback.apply(request, [request.response]); // Return the response object
            // callback.apply(request, [request.responseText]); // Return the response object
        }
    }
    request.send();
}


function formatTime(milliseconds) {
    let seconds = (milliseconds / 1000).toFixed(2); // Convert to seconds and round to 2 decimal places
    let minutes = (milliseconds / 60000).toFixed(2); // Convert to minutes and round to 2 decimal places

    return `${milliseconds.toFixed(3)} ms (${seconds} seconds, ${minutes} minutes)`;
}


function rotateCamera(deltaX, deltaY, sensitivity, cameraPos, cameraUp, cameraDir) {
    // Calculating horizontal and vertical rotation angles
    var horizontalAngle = radians(deltaX * sensitivity);
    var verticalAngle = radians(deltaY * sensitivity);

    // Rotate around the up vector for horizontal rotation
    var horizontalRotation = rotate(horizontalAngle, cameraUp);
    
    // Determining the right vector for vertical rotation
    var rightVector = cross(cameraUp, subtract(cameraPos, cameraDir));
    var verticalRotation = rotate(verticalAngle, rightVector);

    // Applying rotations to the camera position
    cameraPos = mult(horizontalRotation, cameraPos);
    cameraPos = mult(verticalRotation, cameraPos);

    return cameraPos;
}

function displayContents(contents) {
    var element = document.getElementById('file-content');
    element.textContent = contents;
}


// TODO: Not the nicest implementation - should also be able to log fps to file etc.
var lastFrameTime = 0.0;
var currentFrameTime = 0.0;
function updateFPSCounter(e, showfps) {
    currentFrameTime = performance.now();

    if (showfps) {
        e.innerHTML = "FPS: " + parseInt(1000.0 / (currentFrameTime - lastFrameTime));
    } else {
        e.innerHTML = "FPS: --";
    }
    lastFrameTime = currentFrameTime;
}