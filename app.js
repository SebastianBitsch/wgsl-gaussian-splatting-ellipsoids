"use strict"; // With strict mode, you can not, for example, use undeclared variables.

var a; // for debugging in console

// Logging variables
const LOG_INTERVAL = 1000;
var doProgressiveUpdating = false;
var totalRuntime = null;
var currentRuntime = null;
var fpsLabel;

// Camera movement variables
var cameraSensitivity = 10;
var dragging = false;
var lastMouseX = -1;
var lastMouseY = -1;


// When going from rotation matrix to camera basis
//  - Third col is forward
//  - Second col is up, negate to turn right side up
// img 301

let camera0 = {
    "camera_const": 1, 
    "camera_position": [15, 0, 0, 0], 
    "camera_look_point" : [0,0,0, 0], 
    "camera_up_vector": [0,0,1,0]
};

let camera1 = {
    "camera_const": 1, 
    "camera_position": [-3.222086,-0.121226,-4.121659, 0], 
    "camera_look_point" : [-3.062380,-0.191665,-3.137010, 0], 
    "camera_up_vector": [-0.011754, -0.997516, -0.069454, 0]
};
// img 30
let camera2 = {
    "camera_const": 1, 
    "camera_position": [1.47262563, -0.19514904, -2.24352285, 0], 
    "camera_look_point" : [-0.7850281427424773, -0.008068184998965968, 0.6194075552438143, 0], 
    "camera_up_vector": [0.042292231840881954, -0.9982801336144452, -0.04059731464817187, 0]
};
// img 46
let camera3 = {
    "camera_const": 1, 
    "camera_position": [4.1361417825815465, -0.3367029601030584, -1.111293539303772, 0], 
    "camera_look_point" : [-0.7608093251646336, 0.05902557363325378, 0.6462856585131684, 0], 
    "camera_up_vector": [-0.0020018479234047387, -0.9960639931668536, 0.08861441260536376, 0]
};

// truck
// img 249
let camera4 = {
    "camera_const": 1, 
    "camera_position": [-0.7453464164560574, -0.7977114101706951, 4.9695584877985555, 0], 
    "camera_look_point" : [0.20163019603892962, 0.3617058744816951, -0.9102275124444077, 0], 
    "camera_up_vector": [0.08670652504949773, -0.9322570779826731, -0.35125306983007154, 0]
};
// img 70
let camera5 = {
    "camera_const": 1, 
    "camera_position": [-3.039439197893096, -0.4726133599709087, 2.512844345892148, 0], 
    "camera_look_point" : [0.7149919232058494, 0.4106526223365948, -0.5658188522119766, 0], 
    "camera_up_vector": [0.2717905120761306, -0.9089201066746632, -0.3162185276480709, 0]
};
// img 169
let camera6 = {
    "camera_const": 1, 
    "camera_position": [3.0985449119554045, 0.5254505024787448, -1.6331082484937574, 0], 
    "camera_look_point" : [-0.8334831220028989, 0.07785373120153585, 0.5470326150005134, 0], 
    "camera_up_vector": [-0.08601874382482233, -0.996235818354557, 0.010722403565702919, 0]
};

//kitchen
// img 690
let camera7 = {
    "camera_const": 2, 
    "camera_position": [-3.1270714219453923, 1.5662197893753194, -1.8714777477211268, 0], 
    "camera_look_point" : [0.618256836983814, 0.06071940905299374, 0.7836272308228096, 0], 
    "camera_up_vector": [0.36497459798965204, -0.9051795385733871, -0.2178153937864858, 0]
};
// img 767
let camera8 = {
    "camera_const": 2, 
    "camera_position": [1.916728395625472, 0.2651834767479494, -2.5546570572338316, 0], 
    "camera_look_point" : [-0.48370728531411106, 0.35259430458321367, 0.8010646156893545, 0], 
    "camera_up_vector": [-0.5391969607143274, -0.8409985466968951, 0.044587913274138934, 0]
};

// playroom
// img 5674
let camera9 = {
    "camera_const": 2, 
    "camera_position": [0.6511658240697626, 0.6133297590429543, -0.043402685513086466, 0], 
    "camera_look_point" : [0.8195881182564873, 0.5317897406331737, 0.21324865338400573, 0], 
    "camera_up_vector": [0.572201079458985, -0.7406430255068439, -0.3521843742048202, 0]
};




var uniforms = {
    "eps" : 1e-2,
    "aspect_ratio" : 1.0,
    "gamma" : 1.0,
    "frame_number" : 1.0,
    "canvas_width" : 1.0,
    "canvas_height" : 1.0,
    "_padding2" : 0,
    "camera_const" : 1.0,
    "camera_position" : 1.0,
    "camera_look_point" : 1.0,
    "camera_up_vector" : 1.0, 
};

var uniformBuffer;
var drawingInfo;
var bindGroup;

// Add camera to uniforms, swap camera depending on scene. Camera should be part of scene description i think
uniforms = Object.assign({}, uniforms, camera1);

function setupRenderTextures(device, canvas) {
    var textures = new Object();
    textures.width = canvas.width;
    textures.height = canvas.height;
    textures.renderSrc = device.createTexture({
        size: [canvas.width, canvas.height],
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
        format: 'rgba32float',
    });
    textures.renderDst = device.createTexture({
        size: [canvas.width, canvas.height],
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        format: 'rgba32float',
    });
    return textures;
}

function configureBindGroup(device, drawingInfo, pipeline, textures) {
    let uniformValues = new Float32Array(Object.values(uniforms).flat());
    uniformBuffer = device.createBuffer({
        size: uniformValues.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    var buffers = []
    build_bsp_tree(drawingInfo.vertices, device, buffers);
    
    const verticesBuffer = device.createBuffer({
        size: drawingInfo.vertices.byteLength,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE
    });

    // let vertexOrdering = argSortByDistanceTo(drawingInfo.vertexPositions, uniforms.camera_position);
    // const vertexOrderingBuffer = device.createBuffer({
    //     size: vertexOrdering.byteLength,
    //     usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE
    // })

    const sphericalHarmonicsBuffer = device.createBuffer({
        size: drawingInfo.sphericalHarmonics.byteLength,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE
    });

    const invCovMatricesBuffer = device.createBuffer({
        size: drawingInfo.invCovMatrices.byteLength,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE
    })

    device.queue.writeBuffer(uniformBuffer, 0, uniformValues);
    device.queue.writeBuffer(verticesBuffer, 0, drawingInfo.vertices);
    // device.queue.writeBuffer(vertexOrderingBuffer, 0, vertexOrdering);
    device.queue.writeBuffer(sphericalHarmonicsBuffer, 0, drawingInfo.sphericalHarmonics);
    device.queue.writeBuffer(invCovMatricesBuffer, 0, drawingInfo.invCovMatrices);

    var bindGroup = device.createBindGroup({ 
        layout: pipeline.getBindGroupLayout(0), 
        entries: [
            { binding: 0, resource: { buffer: uniformBuffer }},
            { binding: 1, resource: textures.renderDst.createView() },
            { binding: 2, resource: { buffer: verticesBuffer }},
            // { binding: 3, resource: { buffer: vertexOrderingBuffer }},
            { binding: 3, resource: { buffer: sphericalHarmonicsBuffer }},
            { binding: 4, resource: { buffer: invCovMatricesBuffer }},
            { binding: 5, resource: { buffer: buffers.aabb }},
            { binding: 6, resource: { buffer: buffers.treeIds }},
            { binding: 7, resource: { buffer: buffers.bspTree }},
            { binding: 8, resource: { buffer: buffers.bspPlanes }}
        ],
    });

    return bindGroup;
}

function render(device, context, textures, bindGroup, pipeline) {
    // Create render pass in a command buffer and submit it
    const encoder = device.createCommandEncoder();

    const pass = encoder.beginRenderPass({
        colorAttachments: [
            { view: context.getCurrentTexture().createView(), loadOp: "clear", storeOp: "store" }, 
            { view: textures.renderSrc.createView(), loadOp: "load", storeOp: "store" }
        ]
    });

    pass.setBindGroup(0, bindGroup);
    pass.setPipeline(pipeline);
    pass.draw(4); // The number of vertices
    pass.end();

    encoder.copyTextureToTexture(
        { texture: textures.renderSrc }, 
        { texture: textures.renderDst }, 
        [textures.width, textures.height]
    );

    device.queue.submit([encoder.finish()]);
}

function animate(device, context, pipeline, bindGroup, textures) {
    updateFPSCounter(fpsLabel, doProgressiveUpdating);

    // Render the scene
    // bindGroup = configureBindGroup(device, a, pipeline, textures); - no problem writing the buffer, very fast 

    render(device, context, textures, bindGroup, pipeline);
    
    // Update uniforms with the new frame number
    uniforms["frame_number"] = uniforms["frame_number"] + 1;
    let uniformValues = new Float32Array(Object.values(uniforms).flat());
    device.queue.writeBuffer(uniformBuffer, 0, uniformValues);

    if (uniforms['frame_number'] % LOG_INTERVAL == 0) {
        console.log(`%c${uniforms['frame_number']} samples%c: \n| Total Runtime:\t${formatTime(performance.now())} \n| Total frames:\t\t${uniforms['frame_number']} \n| Average time per frame:\t${(uniforms['frame_number'] / performance.now()).toFixed(3)} ms`, "font-weight: bold", "font-weight: normal");
    }

    // Check for termination flag
    if (!doProgressiveUpdating) {
        totalRuntime += performance.now() - currentRuntime;
        return;
    }

    // requestAnimationFrame cant pass arguments to callback, this is a cheeky workaround
    requestAnimationFrame(() => {
        animate(device, context, pipeline, bindGroup, textures);
    });
}


// document.addEventListener("DOMContentLoaded", (_) => {
window.onload = async function () {

    const gpu = navigator.gpu;
    if (!gpu) {
        document.write("Error: Browser doesn't support WebGPU. Use Chrome.");
        return;
    }
    const adapter = await gpu.requestAdapter();
    if (!adapter) {
        document.write("Error: No available WebGPU adapters.");
        return;
    }
    const device = await adapter.requestDevice();

    const canvas = document.getElementById("webgpu-canvas");
    const context = canvas.getContext("gpupresent") || canvas.getContext("webgpu");
    
    const canvasFormat = gpu.getPreferredCanvasFormat();
    const wgsl = device.createShaderModule({
        code: document.getElementById("wgsl").text
    });
    context.configure({
        device: device,
        format: canvasFormat
    });

    fpsLabel = document.getElementById("fps-label");

    const pipeline = device.createRenderPipeline({
        layout: "auto",
        vertex: {
            module: wgsl,
            entryPoint: "main_vs"
        },
        fragment: {
            module: wgsl,
            entryPoint: "main_fs",
            targets: [
                { format: canvasFormat },
                { format: "rgba32float" } 
            ]
        },
        primitive: {
            topology: "triangle-strip"
        }
    });

    let textures = setupRenderTextures(device, canvas);
    
    // Update canvas uniforms
    uniforms["canvas_width"] = canvas.width;
    uniforms["canvas_height"] = canvas.height;
    uniforms["aspect_ratio"] = canvas.width / canvas.height;
    document.getElementById("zoom-slider").value = uniforms.camera_const;
    document.getElementById("zoom-label").innerHTML = "Zoom: " + uniforms.camera_const;

    readFile("data/train.ply", function(response) {
        const [headerString, bodyBuffer] = splitHeaderAndBody(response);
        const header = parseHeader(headerString);
        const drawingInfo = parseBody(header, bodyBuffer);
        
        bindGroup = configureBindGroup(device, drawingInfo, pipeline, textures);

        requestAnimationFrame(() => {
            animate(device, context, pipeline, bindGroup, textures);
        });
    });

    /* Update zoom */
    window.onZoomSliderChange = function(level) {
        // Update the label
        document.getElementById("zoom-label").textContent = "Zoom: " + level;
        
        // Update the uniformsbuffer
        uniforms["camera_const"] = level;
        uniforms["frame_number"] = 0;
        if (!doProgressiveUpdating) {
            requestAnimationFrame(() => {
                animate(device, context, pipeline, bindGroup, textures);
            });
        }
    }; 

    /* Update whether we should do progressive updating */
    window.onDoProgressiveUpdatesChange = function(checked) {
        doProgressiveUpdating = checked;
        
        if (doProgressiveUpdating) {
            currentRuntime = performance.now();
            requestAnimationFrame(() => {
                animate(device, context, pipeline, bindGroup, textures);
            });
        }
    };

    /* Handle camera movement */
    // See mouseevents: https://developer.mozilla.org/en-US/docs/Web/API/Element/mousedown_event
    canvas.addEventListener('mouseleave', function(_) {
        dragging = false;
    });
    
    canvas.addEventListener('mouseup', function(_) {
        dragging = false;
    });

    canvas.addEventListener('mousedown', function(e) {
        dragging = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    });
    
    canvas.addEventListener('mousemove', function(e) {
        if (dragging) {
            var deltaX = e.clientX - lastMouseX;
            var deltaY = e.clientY - lastMouseY;
            uniforms['camera_position'] = rotateCamera(deltaX, deltaY, cameraSensitivity, uniforms['camera_position'], uniforms['camera_up_vector'], uniforms['camera_look_point']);
            uniforms["frame_number"] = 0;

            if (!doProgressiveUpdating) {
                requestAnimationFrame(() => {
                    animate(device, context, pipeline, bindGroup, textures);
                });
            }
        }
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    });
};