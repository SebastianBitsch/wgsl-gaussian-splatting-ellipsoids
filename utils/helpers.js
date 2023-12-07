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

    let shPropertyIndices = properties.flatMap((text, i) => text.includes("f_") ? i : []);
    let vertexPropertyIndices = properties.flatMap((text, i) => !text.includes("f_") ? i : []);

    return {
        nVertices           : nVertices,
        nProperties         : properties.length,
        // nShCoeffs           : nShCoeffs,
        shPropertyIndices   : shPropertyIndices,
        vertexPropertyIndices : vertexPropertyIndices
    }
}

function parseBody(header, bodyBuffer) {
    // NB TODO: I think there can also be uint8's - not just floats so maybe have to change this everything will break if not floats
    const vertexSize = header.nProperties * BYTES_PER_PROPERTY;

    // Float32Arrays to store the vertices 
    const vertices = new Float32Array(header.nVertices * pad(header.vertexPropertyIndices.length));
    const sphericalHarmonics = new Float32Array(header.nVertices * pad(header.shPropertyIndices.length)); // shouldnt be need to pad, but just in case
    
    // Parse the vertices, split on whether they are are vertex data or sh data
    for (let i = 0; i < header.nVertices; i++) {
        let vertexSlice = new Float32Array(bodyBuffer, i * vertexSize, header.nProperties);
        
        vertices.set(header.vertexPropertyIndices.map(e => vertexSlice[e]), i * pad(header.vertexPropertyIndices.length));
        sphericalHarmonics.set(header.shPropertyIndices.map(e => vertexSlice[e]), i * pad(header.shPropertyIndices.length));
    }

    return {
        vertices : vertices,
        sphericalHarmonics : sphericalHarmonics
    };
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

function readSingleFile(e) {
    // https://stackoverflow.com/a/26298948
    var file = e.target.files[0];
    console.log(file);
    if (!file) {
        return;
    }
    var reader = new FileReader();
    reader.onload = function(e) {
        var contents = e.target.result;
        displayContents(contents);
    };
    reader.readAsText(file);
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