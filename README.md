**University of Pennsylvania, CIS 565: GPU Programming and Architecture**
# Project 5 - WebGL Forward+ and Clustered Deferred Shading

* Jonas Oppenheim ([LinkedIn](https://www.linkedin.com/in/jonasoppenheim/), [GitHub](https://github.com/oppenheimj/), [personal](http://www.jonasoppenheim.com/))
* Tested on: Windows 10, Ryzen 9 5950x, 32GB, RTX 3080 (personal machine)

## Live Online

[Link to live version](http://oppenheimj.github.io/Project5-WebGL-Forward-Plus-and-Clustered-Deferred)

## Demo Video/GIF

![](img/coolgif.gif)

## Introduction
The purpose of this assignment was to experiment with three different rendering techniques: Forward, Forward+, and Deferred. Forward rendering involves calling the vertex and fragment shaders for every object in the scene and iterating over all light sources to determine all of the light contributions. Forward+ rendering partitions the camera frustum into a 3D grid of mini frustums and then figures out which lights affect which mini frustums. The mini frustum data is passed to the fragment shader as a texture, which accelerates shading because each fragment "knows" exactly which lights affect it and only iterates over those lights, rather than all lights. Deferred rendering still uses the frustum grid data structure, but also adds in a compute shader which populates a gbuffer with position, normal, and color data for every fragment once and saves this information to a texture. This has the effect of separating vertex shading and fragment shading, so that vertex shading is only done once for the entire scene.

By far the most challenging part about this assignment was constructing the "clusters", which is the space-partitioning data structure that is the camera's frustum sub divided. In the code, I refer to these subdivisions as "mini frustums" because they are not axis-aligned and are not rectangular. The trick is, for each `z`, compute the dimension of the near and far ends of the mini frustum using a rule introduced in the "Virtual Cameras and Spatial Transforms" lecture of CIS 560, which is that `tan(FOV/2) = (screen.height/2)/screen.z`. This means that we can use the camera's field of view and the `screen.z` for both ends of the mini frustum to obtain the dimensions of each end of the frustum. Obtaining all eight points of each mini frustum follows from this.

```
...
const tanFovDiv2 = Math.tan((vertFov/2) * Math.PI / 180.0);
const zDepth = fullDepth / this._zSlices;

for (let z = 0; z < this._zSlices; ++z) {
    const zNear = z * zDepth;
    const zFar = zNear + zDepth;

    const nearScreenHeight = tanFovDiv2 * zNear * 2;
    const farScreenHeight = tanFovDiv2 * zFar * 2;

    const nearScreenWidth = aspect * nearScreenHeight;
    const farScreenWidth = aspect * farScreenHeight;
    ...
```

Three.js's `Frustum`, `Plane`, and `Sphere` classes came in huge here. I began by trying to compute intersections of spheres with planes and then circles with lines, and then discovered that Three's Frustum class had a built-in method for computing intersections.

I believe I have all implementations working, but the actual framerate of the more advanced techniques is lower than the naive framerate. I tried doing clever things with the Javascript in order to make the code flow and read better, but as is often the case, the most readable code is often inefficient and the most performant code is unreadable.

## Effects
Blinn-Phong shading was implemented with the help of shader code from assignment 4 of CIS 560:
```
void main() {
    vec4 diffuseColor = texture(u_Texture, fs_UV);

    float diffuseTerm = clamp(dot(normalize(fs_Nor), normalize(fs_LightVec)), 0, 1);
    float ambientTerm = 0.2;

    float lightIntensity = diffuseTerm + ambientTerm;

    float shininessExponent = 30;
    float specularIntensity = max(pow(dot(normalize((fs_CameraPos + fs_LightVec) / 2), fs_Nor), shininessExponent), 0);

    out_Col = vec3(diffuseColor.rgb * lightIntensity + specularIntensity);
}
```
Only light modification (_pun intended_) was needed to integrate this shader with the Forward+ shader. I did have to pass in the camera position.
![](/img/blinnphong.png)

## Optimizations
The most significant optimization came from the realization that the mini frustum data structure only needs to computed once and then can be reused every time `updateClusters()` is called. Concretly, the abstract class `BaseRenderer` is given a function `initializeMiniFrustums(camera)`, which creates an instance variable called `index2MiniFrustum` that maps a cluster index to a Three.js Frustum object. Then, every call to `updateClusters()` can iterate through this JSON object like
```
Object.entries(this.index2MiniFrustum).forEach(([index, miniFrustum]) => {
    for (let lightIndex = 0; lightIndex < NUM_LIGHTS; lightIndex++) {
        ...
    }
}
``` 
which simply iterates over the mini frustums instead of recomputing them. The graph below shows that with 100 lights, Forward+ went from 27ms to 7ms per frame with this optimization. Absolute stonks.
![](/img/mini_frustum_comp.png)

## Performance
My implementations of Forward+ and Deferred did not outperform Forward. I have a feeling the reason is that I was doing things in Javascript that made the code more readable but less performant. I spent a significant amount of time staring at the Chrome profiler and could not figure out how to optimize further. This plot _should_ use milliseconds per frame instead of frames per second, but for some reason, milliseconds always showed up as 0 for Forward.
![](/img/sadge.png)



## Specific references:
* Three.js Frustum documentation
* CIS 560 Blinn-Phong shader from homework 4
* CIS 560 "Virtual Cameras and Spatial Transforms" lecture slides

## Credits
* [Three.js](https://github.com/mrdoob/three.js) by [@mrdoob](https://github.com/mrdoob) and contributors
* [stats.js](https://github.com/mrdoob/stats.js) by [@mrdoob](https://github.com/mrdoob) and contributors
* [webgl-debug](https://github.com/KhronosGroup/WebGLDeveloperTools) by Khronos Group Inc.
* [glMatrix](https://github.com/toji/gl-matrix) by [@toji](https://github.com/toji) and contributors
* [minimal-gltf-loader](https://github.com/shrekshao/minimal-gltf-loader) by [@shrekshao](https://github.com/shrekshao)
