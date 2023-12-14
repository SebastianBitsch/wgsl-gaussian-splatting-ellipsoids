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

// Camera positions for different scenes
// let camera = {"camera_const": 2.5, "camera_position": [2, 20, 3, 0], "camera_look_point" : [0, 0, 0, 0], "camera_up_vector": [0.0, 0.0, 1.0, 0]};
let camera = {"camera_const": .5, "camera_position": [-3.222086,-0.121226,-4.121659, 0], "camera_look_point" : [-3.062380,-0.191665,-3.137010, 0], "camera_up_vector": [-0.011754, -0.997516, -0.069454, 0]};


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
uniforms = Object.assign({}, uniforms, camera);

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
    
    const verticesBuffer = device.createBuffer({
        size: drawingInfo.vertices.byteLength,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE
    });

    let vertexOrdering = argSortByDistanceTo(drawingInfo.vertexPositions, uniforms.camera_position);
    const vertexOrderingBuffer = device.createBuffer({
        size: vertexOrdering.byteLength,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE
    })

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
    device.queue.writeBuffer(vertexOrderingBuffer, 0, vertexOrdering);
    device.queue.writeBuffer(sphericalHarmonicsBuffer, 0, drawingInfo.sphericalHarmonics);
    device.queue.writeBuffer(invCovMatricesBuffer, 0, drawingInfo.invCovMatrices);

    var bindGroup = device.createBindGroup({ 
        layout: pipeline.getBindGroupLayout(0), 
        entries: [
            { binding: 0, resource: { buffer: uniformBuffer }},
            { binding: 1, resource: textures.renderDst.createView() },
            { binding: 2, resource: { buffer: verticesBuffer }},
            { binding: 3, resource: { buffer: vertexOrderingBuffer }},
            { binding: 4, resource: { buffer: sphericalHarmonicsBuffer }},
            { binding: 5, resource: { buffer: invCovMatricesBuffer }}
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
    if (doProgressiveUpdating) {
        updateFPSCounter(fpsLabel);
    } else {
        updateFPSCounter(fpsLabel, false);
    }

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
        document.write("Error: Browser doesn't support WebGPU. Use Chrome.");
        return;
    }
    // ------------- Do setup -------------
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
    
    uniforms["canvas_width"] = canvas.width;
    uniforms["canvas_height"] = canvas.height;
    uniforms["aspect_ratio"] = canvas.width / canvas.height;
    document.getElementById("zoom-slider").value = uniforms.camera_const;
    document.getElementById("zoom-label").innerHTML = "Zoom: " + uniforms.camera_const;

    readFile("data/train.ply", function(response) {
        const [headerString, bodyBuffer] = splitHeaderAndBody(response);
        const header = parseHeader(headerString);
        const drawingInfo = parseBody(header, bodyBuffer);

        a = drawingInfo;
        // displayContents(headerString);
        
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