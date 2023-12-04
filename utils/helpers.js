
function readFile(fileName, callback) {
    var request = new XMLHttpRequest(); 
    request.open('GET', fileName, true); // Create a request to get file 
    request.onreadystatechange = function() {
        if (request.readyState === 4 && request.status !== 404 && typeof(callback) == "function") {
            callback.apply(request);
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


/**
 * Bare bones .ply file parser. Makes a lot of assumptions about how the data looks 
 * @param {String} file the string contents of a .ply file 
 * @returns 
 */
function parsePly(file) {

    file = file.split("\n");

    let headerLen = file.findIndex(e => e == "end_header")
    let header = file.slice(0, headerLen);
    let lines = file.slice(headerLen + 1, -1);

    // TODO: Assert first line is "ply"
    // TODO: Check there are 3 "property float32 x,y,z"
    // TODO: Check if there are normals
    // TODO: Make more robust
    
    // Parse header
    let nPoints = parseInt(header.find(e => e.includes("element vertex")).split(" ")[2]); // not really neccessary, could just do length(lines) tbh
    
    // Parse lines
    // Parse vertices
    let vertices = new Float32Array(nPoints * 4); // We need to pad vertices with an extra 0
    for (var i in lines) {
        let nums = lines[i].split(" ").map(Number);
        vertices[i * 4    ] = nums[0];
        vertices[i * 4 + 1] = nums[1];
        vertices[i * 4 + 2] = nums[2];
        vertices[i * 4 + 3] = 0;        
    }

    // Parse normals
    // TODO

    // TODO center vertices around origin (0,0,0)

    return {"vertices" : vertices};
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