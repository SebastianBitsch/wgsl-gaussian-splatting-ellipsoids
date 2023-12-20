# WebGPU Ray-Cast Gaussian Splatting Renderer

## Note: This project is made as an exam project in the DTU course [Rendering (02562)](https://courses.compute.dtu.dk/02562/)


This repository contains a WebGPU-based renderer for visualizing data from Gaussian Splatting Neural Radiance Fields. The project is an attempt at visualizing Gaussians with ray-casting, where the problem is modelled as rendering semi-transparent ellipsoids, representing the Gaussian Splatting process.

## Usage

1. Open Chrome (open in unsafe mode for faster development ```open -a Google\ Chrome --args --allow-file-access-from-files```)
1. Load a `.ply` file with Gaussian Splatting data using the interface.
    - Files that are known to work can be downloaded [from here](https://drive.google.com/drive/folders/1tGsWJwoIi20T9TqPYBk7kJh1jPfh8lQE) and [from here](https://jatentaki.github.io/portfolio/gaussian-splatting/)
2. Use the on-screen controls to manipulate the camera and adjust rendering settings.
3. View the rendered Gaussian Splatting scene directly in your browser.

## Acknowledgements
Thanks to [Michał Tyszkiewicz](https://jatentaki.github.io/portfolio/gaussian-splatting/) for providing data freely available. 


