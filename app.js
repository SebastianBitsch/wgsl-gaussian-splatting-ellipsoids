"use strict"; // With strict mode, you can not, for example, use undeclared variables.

// Logging variables
const LOG_INTERVAL = 1000;
var doProgressiveUpdating = false;
var totalRuntime = null;
var currentRuntime = null;

var uniformBuffer;
var drawingInfo;
var bindGroup;

// Camera positions for different scenes
let bunny_camera = {"camera_const": 3.5, "camera_position": [-0.02, 0.11, 0.6, 0], "camera_viewing_direction" : [-0.02, 0.11, 0.0, 0], "camera_up_vector": [0.0, 1.0, 0.0, 0]};
let box_camera = {"camera_const": 1.0, "camera_position": [277.0, 275.0, -570.0, 0], "camera_viewing_direction" : [277.0, 275.0, 0.0, 0], "camera_up_vector": [0.0, 1.0, 0.0, 0]};
let teapot_camera = {"camera_const": 2.5, "camera_position": [12, 12, 8, 0], "camera_viewing_direction" : [0, 0, 1, 0], "camera_up_vector": [0.0, 0.0, 1.0, 0]};

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
    "camera_viewing_direction" : 1.0,
    "camera_up_vector" : 1.0, 
};

let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

// Add camera to uniforms, swap camera depending on scene. Camera should be part of scene description i think
uniforms = Object.assign({}, uniforms, teapot_camera);


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
    
    const vertexPositionsBuffer = device.createBuffer({
        size: drawingInfo.vertices.byteLength,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE
    });

    device.queue.writeBuffer(uniformBuffer, 0, uniformValues);
    device.queue.writeBuffer(vertexPositionsBuffer, 0, drawingInfo.vertices);

    var bindGroup = device.createBindGroup({ 
        layout: pipeline.getBindGroupLayout(0), 
        entries: [
            { binding: 0, resource: { buffer: uniformBuffer }},
            { binding: 1, resource: textures.renderDst.createView() },
            { binding: 2, resource: { buffer: vertexPositionsBuffer }}
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
    // Render the scene
    render(device, context, textures, bindGroup, pipeline);
    
    // Update uniforms with the new frame number
    uniforms["frame_number"] = uniforms["frame_number"] + 1;
    let uniformValues = new Float32Array(Object.values(uniforms).flat());
    device.queue.writeBuffer(uniformBuffer, 0, uniformValues);

    console.log(uniforms['camera_const']);
    if (uniforms['frame_number'] % LOG_INTERVAL == 0) {
        console.log(`%c${uniforms['frame_number']} samples%c: \n| Total Runtime:\t${formatTime(performance.now())} \n| Total frames:\t\t${uniforms['frame_number']} \n| Average time per frame:\t${(uniforms['frame_number'] / performance.now()).toFixed(3)} ms`, "font-weight: bold", "font-weight: normal");
    }

    // Check for termination flag
    if (!doProgressiveUpdating) {
        totalRuntime += performance.now() - currentRuntime;
        console.log(`%cDone sampling%c \n| Total Runtime:\t${formatTime(totalRuntime)} \n| Total frames:\t\t${uniforms['frame_number']} \n| Average time per frame:\t${(uniforms['frame_number'] / totalRuntime).toFixed(3)} ms`, "font-weight: bold", "font-weight: normal");
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
        document.write("Error: Browser doesn't support gpu");
        return;
    }
    // ------------- Do setup -------------
    const adapter = await gpu.requestAdapter();
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
    
    uniforms["canvas_width"] = canvas.width;
    uniforms["canvas_height"] = canvas.height;
    uniforms["aspect_ratio"] = canvas.width / canvas.height;


    readFile("data/teapot.ply", function() {
        
        drawingInfo = parsePly(this.responseText);
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
};