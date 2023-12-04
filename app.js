"use strict"; // With strict mode, you can not, for example, use undeclared variables.

// Camera positions for different scenes
let bunny_camera = {"camera_const": 3.5, "camera_position": [-0.02, 0.11, 0.6, 0], "camera_viewing_direction" : [-0.02, 0.11, 0.0, 0], "camera_up_vector": [0.0, 1.0, 0.0, 0]};
let box_camera = {"camera_const": 1.0, "camera_position": [277.0, 275.0, -570.0, 0], "camera_viewing_direction" : [277.0, 275.0, 0.0, 0], "camera_up_vector": [0.0, 1.0, 0.0, 0]};
let teapot_camera = {"camera_const": 2.5, "camera_position": [0.15, 1.5, 10.0, 0], "camera_viewing_direction" : [0.15, 1.5, 0.0, 0], "camera_up_vector": [0.0, 1.0, 0.0, 0]};

var uniforms = {
    "eps" : 1e-2,
    "aspect_ratio" : 1.0,
    "gamma" : 1.5,
    "frame_number" : 1.0,
    "canvas_width" : 1.0,
    "canvas_height" : 1.0,
    "_padding2" : 0,
    "camera_const" : 1.0,
    "camera_position" : 1.0,
    "camera_viewing_direction" : 1.0,
    "camera_up_vector" : 1.0, 
};

// Add camera to uniforms, swap camera depending on scene. Camera should be part of scene description i think
uniforms = Object.assign({}, uniforms, box_camera);


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
            targets: [{ format: canvasFormat }]
        },
        primitive: {
            topology: "triangle-strip"
        }
    });

    uniforms["canvas_width"] = canvas.width;
    uniforms["canvas_height"] = canvas.height;
    uniforms["aspect_ratio"] = canvas.width / canvas.height;


    readFile("data/teapot.ply", function() {

        let uniformValues = new Float32Array(Object.values(uniforms).flat());
        const uniformBuffer = device.createBuffer({
            size: uniformValues.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        device.queue.writeBuffer(uniformBuffer, 0, uniformValues);
    
        var bindGroup = device.createBindGroup({ 
            layout: pipeline.getBindGroupLayout(0), 
            entries: [
                { binding: 0, resource: { buffer: uniformBuffer }}
                // { binding: 1, resource: { buffer:  }}
            ],
        });

        const encoder = device.createCommandEncoder();

        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                view: context.getCurrentTexture().createView(),
                loadOp: "clear",
                storeOp: "store"
            }]
        });

        pass.setBindGroup(0, bindGroup);
        pass.setPipeline(pipeline);
        pass.draw(4); // The number of vertices
        pass.end();

        device.queue.submit([encoder.finish()]);

        console.log(parsePly(this.responseText));
        // displayContents(this.responseText)
    });
    

    // TODO: Temporary
    document.getElementById('file-input').addEventListener('change', readSingleFile, false);
};