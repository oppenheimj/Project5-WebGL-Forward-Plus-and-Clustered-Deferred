import TextureBuffer from './textureBuffer';
import { vec3, vec4, subtract, mat4 } from 'gl-matrix';
import { NUM_LIGHTS } from '../scene';
import { Vector3, Vector4, Matrix4, Plane, Sphere, Frustum } from 'three';

export const MAX_LIGHTS_PER_CLUSTER = 100;

class Side {
  constructor(p1, p2, p3, p4) {
    this.p1 = p1
    this.p2 = p2
    this.p3 = p3
    this.p4 = p4

    this.generateNormal()
  }

  generateNormal() {
    var line1 = vec3.create()
    line1 = vec3.subtract(line1, this.p2, this.p1)

    var line2 = vec3.create()
    line2 = vec3.subtract(line2, this.p2, this.p3)

    this.normal = vec3.create()
    
    this.normal = vec3.cross(this.normal, line1, line2)
    this.normal = vec3.multiply(this.normal, vec3.fromValues(-1, -1, -1), this.normal)
    this.normal = vec3.normalize(this.normal, this.normal);
  }

  intersectsSphere(center, radius) {
    var v = vec3.create();
    v = vec3.subtract(v , center, this.p1);

    var d = vec3.dot(v, this.normal);

    // console.log('Distance from ', center, ' to plane ', this.normal, ' at point ', this.p1, ' is ', d)
  }
}

export class BaseRenderer {
  constructor(xSlices, ySlices, zSlices) {
    // Create a texture to store cluster data. Each cluster stores the number of lights followed by the light indices
    
    // This stores one element per miniFrustum (in row) and each miniFrustum's data has to get packed
    // into "pixels", where each "pixel" stores four floats. In this case, we want to store
    // MAX_LIGHTS_PER_CLUSTER + 1 floats, which can fit in (MAX_LIGHTS_PER_CLUSTER + 1) / 4 pixels.
    this._clusterTexture = new TextureBuffer(xSlices * ySlices * zSlices, MAX_LIGHTS_PER_CLUSTER + 1);
    this._xSlices = xSlices;
    this._ySlices = ySlices;
    this._zSlices = zSlices;
  }

  computeLightSphereAndCenter(light, viewMatrix) {
    var center = vec4.fromValues(
      light.position[0],
      light.position[1],
      light.position[2],
      1.0);

    vec4.transformMat4(center, center, viewMatrix);
    center = new Vector3(center[0], center[1], center[2]);

    return new Sphere(center, light.radius);
  }

  computeMiniFrustum(xNearLeft, xNearRight, yNearBottom, yNearTop, xFarLeft, xFarRight, yFarBottom, yFarTop, zNear, zFar) {
    var frontPlane = new Plane();
    frontPlane.setFromCoplanarPoints(
      new Vector3(xNearLeft, yNearBottom, zNear),
      new Vector3(xNearRight, yNearBottom, zNear),
      new Vector3(xNearRight, yNearTop, zNear)
    );
    // vec3.fromValues(xNearLeft, yNearTop, zNear)

    var backPlane = new Plane();
    backPlane.setFromCoplanarPoints(
      new Vector3(xFarLeft, yFarBottom, zFar),
      new Vector3(xFarLeft, yFarTop, zFar),
      new Vector3(xFarRight, yFarTop, zFar)
    );
    // vec3.fromValues(xFarRight, yFarBottom, zFar)

    var leftPlane = new Plane();
    leftPlane.setFromCoplanarPoints(
      new Vector3(xNearLeft, yNearBottom, zNear),
      new Vector3(xNearLeft, yNearTop, zNear),
      new Vector3(xFarLeft, yFarTop, zFar)
    );
    // vec3.fromValues(xFarLeft, yFarBottom, zFar)


    var rightPlane = new Plane();
    rightPlane.setFromCoplanarPoints(
      new Vector3(xNearRight, yNearBottom, zNear),
      new Vector3(xFarRight, yFarBottom, zFar),
      new Vector3(xFarRight, yFarTop, zFar)
    );
    // vec3.fromValues(xNearRight, yNearTop, zNear)

    var topPlane = new Plane();
    topPlane.setFromCoplanarPoints(
      new Vector3(xNearLeft, yNearTop, zNear),
      new Vector3(xNearRight, yNearTop, zNear),
      new Vector3(xFarRight, yFarTop, zFar)
    );
    // vec3.fromValues(xFarLeft, yFarTop, zFar)

    var bottomPlane = new Plane();
    bottomPlane.setFromCoplanarPoints(
      new Vector3(xNearLeft, yNearBottom, zNear),
      new Vector3(xFarLeft, yFarBottom, zFar),
      new Vector3(xFarRight, yFarBottom, zFar)
    );
    // vec3.fromValues(xNearRight, yNearBottom, zNear)

    // https://threejs.org/docs/#api/en/math/Frustum
    return new Frustum(frontPlane, backPlane, leftPlane, rightPlane, topPlane, bottomPlane);
  }

  initializeMiniFrustums(camera) {
    this.index2MiniFrustum = {};

    const nearClip = camera.near;
    const farClip = camera.far;
    const fullDepth = farClip - nearClip;

    const vertFov = camera.fov;
    const aspect = camera.aspect;

    // CIS560: tan(FOV/2) = (screen.height/2)/screen.z
    const tanFovDiv2 = Math.tan((vertFov/2) * Math.PI / 180.0);

    // xWidth, yHeight, and zDepth
    const zDepth = fullDepth / this._zSlices;

    for (let z = 0; z < this._zSlices; ++z) {
      // Knowing z allows us to compute the dimensions of both near and far
      // ends of the frustum, using CIS560: tan(FOV/2) = (screen.height/2)/screen.z

      const zNear = z * zDepth;
      const zFar = zNear + zDepth;
      const nearScreenHeight = tanFovDiv2 * zNear * 2;
      const farScreenHeight = tanFovDiv2 * zFar * 2;

      // aspect = width / height
      const nearScreenWidth = aspect * nearScreenHeight;
      const farScreenWidth = aspect * farScreenHeight;

      const xNearWidth = nearScreenWidth / this._xSlices;
      const yNearHeight = nearScreenHeight / this._ySlices;

      const xFarWidth = farScreenWidth / this._xSlices;
      const yFarHeight = farScreenHeight / this._ySlices;

      for (let y = 0; y < this._ySlices; ++y) {
        const yNearBottom = y * yNearHeight;
        const yNearTop = yNearBottom + yNearHeight;

        const yFarBottom = y * yFarHeight;
        const yFarTop = yFarBottom + yFarHeight;

        for (let x = 0; x < this._xSlices; ++x) {
          const xNearLeft = x * xNearWidth;
          const xNearRight = xNearLeft + xNearWidth;
  
          const xFarLeft = x * xFarWidth;
          const xFarRight = xFarLeft + xFarWidth;

          let miniFrustumIndex = x + y * this._xSlices + z * this._xSlices * this._ySlices;
          const miniFrustum = this.computeMiniFrustum(
            xNearLeft, xNearRight,
            yNearBottom, yNearTop,
            xFarLeft, xFarRight,
            yFarBottom, yFarTop,
            zNear, zFar
          );

          this.index2MiniFrustum[miniFrustumIndex] = miniFrustum;
        }
      }
    }
  }

  computeLightIndex2Sphere(scene, viewMatrix) {
    var lightIndex2Sphere = {};

    for (let lightIndex = 0; lightIndex < NUM_LIGHTS; lightIndex++) {
      const center = vec4.fromValues(
        scene.lights[lightIndex].position[0],
        scene.lights[lightIndex].position[1],
        scene.lights[lightIndex].position[2],
        1.0);

      vec4.transformMat4(center, center, viewMatrix);
      center = new Vector3(center[0], center[1], center[2]);
      lightIndex2Sphere[lightIndex] = new Sphere(center, scene.lights[lightIndex].radius);
    }

    return lightIndex2Sphere;
  }

  updateClustersEfficient(scene, viewMatrix) {
    const lightIndex2Sphere = this.computeLightIndex2Sphere(scene, viewMatrix)

    Object.entries(this.index2MiniFrustum).forEach(([index, miniFrustum]) => {
      this._clusterTexture.buffer[this._clusterTexture.bufferIndex(index, 0)] = 0;

      var bufferPtr = 1;
      for (let lightIndex = 0; lightIndex < NUM_LIGHTS; lightIndex++) {
        const sphere = lightIndex2Sphere[lightIndex];

        if (miniFrustum.intersectsSphere(sphere)) {
          const componentOffset = Math.floor(bufferPtr / 4);
          const floatOffset = bufferPtr % 4;

          this._clusterTexture.buffer[this._clusterTexture.bufferIndex(index, componentOffset) + floatOffset] = lightIndex;
          this._clusterTexture.buffer[this._clusterTexture.bufferIndex(index, 0)]++;

          bufferPtr++;
        }
      }
    });

    this._clusterTexture.update();
  }

  // Inefficient
  updateClusters(camera, viewMatrix, scene) {
    // TODO: Update the cluster texture with the count and indices of the lights in each cluster
    // This will take some time. The math is nontrivial...

    const nearClip = camera.near;
    const farClip = camera.far;
    const fullDepth = farClip - nearClip;

    const aspect = camera.aspect;
    const vertFov = camera.fov;

    // CIS560: tan(FOV/2) = (screen.height/2)/screen.z
    const tanFovDiv2 = Math.tan((vertFov/2) * Math.PI / 180.0);

    // xWidth, yHeight, and zDepth
    const zDepth = fullDepth / this._zSlices;

    for (let z = 0; z < this._zSlices; ++z) {
      // Knowing z allows us to compute the dimensions of both near and far
      // ends of the frustum

      const zNear = z * zDepth;
      const zFar = zNear + zDepth;
      const nearScreenHeight = tanFovDiv2 * zNear * 2;
      const farScreenHeight = tanFovDiv2 * zFar * 2;

      // aspect = width / height
      const nearScreenWidth = aspect * nearScreenHeight;
      const farScreenWidth = aspect * farScreenHeight;

      const xNearWidth = nearScreenWidth / this._xSlices;
      const yNearHeight = nearScreenHeight / this._ySlices;

      const xFarWidth = farScreenWidth / this._xSlices;
      const yFarHeight = farScreenHeight / this._ySlices;

      for (let y = 0; y < this._ySlices; ++y) {
        const yNearBottom = y * yNearHeight;
        const yNearTop = yNearBottom + yNearHeight;

        const yFarBottom = y * yFarHeight;
        const yFarTop = yFarBottom + yFarHeight;

        for (let x = 0; x < this._xSlices; ++x) {
          const xNearLeft = x * xNearWidth;
          const xNearRight = xNearLeft + xNearWidth;
  
          const xFarLeft = x * xFarWidth;
          const xFarRight = xFarLeft + xFarWidth;

          let miniFrustumIndex = x + y * this._xSlices + z * this._xSlices * this._ySlices;
          const miniFrustum = this.computeMiniFrustum(
            xNearLeft, xNearRight,
            yNearBottom, yNearTop,
            xFarLeft, xFarRight,
            yFarBottom, yFarTop,
            zNear, zFar
          );

          // Reset the light count to 0 for every cluster
          this._clusterTexture.buffer[this._clusterTexture.bufferIndex(miniFrustumIndex, 0)] = 0;

          var bufferPtr = 1;
          for (let lightIndex = 0; lightIndex < NUM_LIGHTS; ++lightIndex) {
            const sphere = this.computeLightSphereAndCenter(scene.lights[lightIndex], viewMatrix);

            if (miniFrustum.intersectsSphere(sphere)) {
              const componentOffset = Math.floor(bufferPtr / 4);
              const floatOffset = bufferPtr % 4;

              this._clusterTexture.buffer[this._clusterTexture.bufferIndex(miniFrustumIndex, componentOffset) + floatOffset] = lightIndex;
              this._clusterTexture.buffer[this._clusterTexture.bufferIndex(miniFrustumIndex, 0)]++;

              bufferPtr++;
            }
          }
        }
      }
    }

    this._clusterTexture.update();
  }
}
