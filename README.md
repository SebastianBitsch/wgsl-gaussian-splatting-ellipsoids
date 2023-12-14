



### Notes
- For issues with very small gaussians see commit ```1cb7ff3813f0f5955a0a5ad6d8ce2c733c3c600e```.
    - Related to zooming by changing the camera-constant (FOV), this can make rays too parallel to render small objects nicely. With small camera constant rays diverge more, covering more of the scene. Objects far from the camera can still occupy a significant portion of the screen space.

