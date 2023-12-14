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

function parseHeader(headerString) {

    let headerArray = headerString.split("\n");

    let nVertices = parseInt(headerArray.find(e => e.includes("element vertex")).split(" ")[2]); // TODO: not the most elegant solution

    let properties = headerArray.filter(e => e.includes("property"));
    // NB: f_dc_ are not included in count or degree calculation - but is used when getting the coefficients
    // let nCoeffsPerColor = headerString.Count("f_rest_") / 3;            // 15
    // let nCoeffsPerColor = headerString.Count("f_") / 3;            // 16
    // console.assert(nCoeffsPerColor % 3 == 0); // We should have RGB values i.e. 3
    // let sphericalHarmonicsDegree = Math.sqrt(nCoeffsPerColor + 1) - 1;  // 3
    // let nShCoeffsTable = {0 : 1, 1: 4, 2: 9, 3: 16};                    // Pretty sure this isnt neccessary, just use nCoeffsPerColor + 1
    // let nShCoeffs = nShCoeffsTable[sphericalHarmonicsDegree];           // 16 (1 extra for 3 x fc_dc)
    // let nShCoeffs = nCoeffsPerColor;                                // 16 (1 extra for 3 x fc_dc)

    // TODO: all this could be a single for loop but..
    let shPropertyIndices = properties.flatMap((text, i) => text.includes("f_") ? i : []);
    let vertexPropertyIndices = properties.flatMap((text, i) => !text.includes("f_") ? i : []);
    let vertexPosPropertyIndices = properties.flatMap((text, i) => text.includes("float x") || text.includes("float y") || text.includes("float z") ? i : []);

    return {
        nVertices           : nVertices,
        nProperties         : properties.length,
        propertyNames       : properties, // TODO: could do everything with this tbh
        // nShCoeffs           : nShCoeffs,
        shPropertyIndices   : shPropertyIndices,
        vertexPropertyIndices : vertexPropertyIndices,
        vertexPosPropertyIndices : vertexPosPropertyIndices
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
    // const vertexPositions = new Float32Array(header.nVertices * pad(3)); // Used just for sorting, assume 3D.. 
    const vertexPositions = [];//new Array(header.nVertices).fill(0).map(() => new Array(4).fill(0));
    const sphericalHarmonics = new Float32Array(header.nVertices * pad(header.shPropertyIndices.length)); // shouldnt be need to pad, but just in case
    const invCovMatrices = new Float32Array(header.nVertices * pad(9)); // Cotains 3x3 matrices 

    // Parse the vertices, split on whether they are are vertex data or sh data
    for (let i = 0; i < header.nVertices; i++) {
        let vertexSlice = new Float32Array(bodyBuffer, i * vertexSize, header.nProperties);
        var rotation = [0,0,0,1];
        var scale = [];
        
        // TODO: Should be a single for loop for extra speed
        for (let j = 0; j < header.nProperties; j++) {

            // x,y,z,nx,ny,nz,opacity,scale,rot
            if (header.vertexPropertyIndices.includes(j)) {
                if (header.propertyNames[j].includes('scale_')) {
                    vertexSlice[j] = Math.exp(vertexSlice[j]);
                    if (i == 1) {
                        console.log(vertexSlice[j]);
                    }
                    scale.push(vertexSlice[j]);
                }
                if (header.propertyNames[j].includes('opacity')) {
                    vertexSlice[j] = 1.0;//Sigmoid(vertexSlice[j]);
                }
                if (header.propertyNames[j].includes('rot_')) {
                    // rotation.push(0);
                    // rotation.push(vertexSlice[j]);
                }
            }
        }

        if (i == 1) {
            console.log(rotation);
            console.log(scale);
            console.log(InvCovarianceMatrix3d(scale, rotation));
        }
        
        vertices.set(header.vertexPropertyIndices.map(e => vertexSlice[e]), i * pad(header.vertexPropertyIndices.length));
        vertexPositions.push(header.vertexPosPropertyIndices.map(e => vertexSlice[e]));
        sphericalHarmonics.set(header.shPropertyIndices.map(e => vertexSlice[e]), i * pad(header.shPropertyIndices.length));
        invCovMatrices.set(AddFourthDimension(flatten(InvCovarianceMatrix3d(scale, rotation))), i * pad(9));
    }

    return {
        vertices : vertices,
        vertexPositions: vertexPositions,
        sphericalHarmonics : sphericalHarmonics,
        invCovMatrices : invCovMatrices
    };
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
function updateFPSCounter(e, setNa = false) {
    currentFrameTime = performance.now();

    if (setNa) {
        e.innerHTML = "FPS: --";
    } else {
        e.innerHTML = "FPS: " + parseInt(1000.0 / (currentFrameTime - lastFrameTime));
    }
    lastFrameTime = currentFrameTime;
}