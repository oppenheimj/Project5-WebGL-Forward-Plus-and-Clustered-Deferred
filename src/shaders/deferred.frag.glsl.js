export default function(params) {
  return `
  #version 100
  precision highp float;

  uniform sampler2D u_gbuffers[${params.numGBuffers}];

  varying vec2 v_uv;

  uniform sampler2D u_lightbuffer;
  uniform sampler2D u_clusterbuffer;

  uniform int u_clusterTextureWidth;
  uniform int u_clusterTextureHeight;

  uniform float u_xSlices;
  uniform float u_ySlices;
  uniform float u_zSlices;

  uniform float u_nearClip;
  uniform float u_farClip;

  uniform float u_canvasWidth;
  uniform float u_canvasHeight;

  uniform mat4 u_viewMatrix;

  vec3 applyNormalMap(vec3 geomnor, vec3 normap) {
    normap = normap * 2.0 - 1.0;
    vec3 up = normalize(vec3(0.001, 1, 0.001));
    vec3 surftan = normalize(cross(geomnor, up));
    vec3 surfbinor = cross(geomnor, surftan);
    return normap.y * surftan + normap.x * surfbinor + normap.z * geomnor;
  }

  struct Light {
    vec3 position;
    float radius;
    vec3 color;
  };

  // For the cluster texture, the width is the number of miniFrustums (aka clusters) and height is the
  // number of pixels
  float ExtractFloat(sampler2D texture, int textureWidth, int textureHeight, int index, int component) {
    float u = float(index + 1) / float(textureWidth + 1);
    int pixel = component / 4;
    float v = float(pixel + 1) / float(textureHeight + 1);
    vec4 texel = texture2D(texture, vec2(u, v));
    int pixelComponent = component - pixel * 4;

    if (pixelComponent == 0) {
      return texel[0];
    } else if (pixelComponent == 1) {
      return texel[1];
    } else if (pixelComponent == 2) {
      return texel[2];
    } else if (pixelComponent == 3) {
      return texel[3];
    }
  }

  Light UnpackLight(int index) {
    Light light;
    float u = float(index + 1) / float(${params.numLights + 1});
    vec4 v1 = texture2D(u_lightbuffer, vec2(u, 0.3));
    vec4 v2 = texture2D(u_lightbuffer, vec2(u, 0.6));
    light.position = v1.xyz;

    // LOOK: This extracts the 4th float (radius) of the (index)th light in the buffer
    // Note that this is just an example implementation to extract one float.
    // There are more efficient ways if you need adjacent values
    light.radius = ExtractFloat(u_lightbuffer, ${params.numLights}, 2, index, 3);

    light.color = v2.rgb;
    return light;
  }

  // Cubic approximation of gaussian curve so we falloff to exactly 0 at the light radius
  float cubicGaussian(float h) {
    if (h < 1.0) {
      return 0.25 * pow(2.0 - h, 3.0) - pow(1.0 - h, 3.0);
    } else if (h < 2.0) {
      return 0.25 * pow(2.0 - h, 3.0);
    } else {
      return 0.0;
    }
  }

  void main() {
    // TODO: extract data from g buffers and do lighting

    // pos
    vec4 gb0 = texture2D(u_gbuffers[0], v_uv);

    // col
    vec4 gb1 = texture2D(u_gbuffers[1], v_uv);

    // norm
    vec4 gb2 = texture2D(u_gbuffers[2], v_uv);

    // unused
    vec4 gb3 = texture2D(u_gbuffers[3], v_uv);

    vec3 v_position = gb0.xyz;
    vec3 albedo = gb1.rgb;
    vec3 normal = gb2.xyz;

    // So the idea is to figure out which miniFrustum this fragment is inside
    // and then only check against the lights associated with that miniFrustum
    // Obtain pixel's camera space position
    
    // gl_FragCoord represents the pixel's position in screen space
    // These are the same units as u_canvasWidth and u_canvasHeight,
    // namely raw pixels. Dividing gives percent across the screen,
    // which can be used in conjunction with numSlices to obtain coord.

    int x = int(float(gl_FragCoord.x) / u_canvasWidth * u_xSlices);
    int y = int(float(gl_FragCoord.y) / u_canvasHeight * u_ySlices);

    vec4 fragPosInCameraCoords = u_viewMatrix * vec4(v_position, 1.0);
    float fullDepth = u_farClip - u_nearClip;
    float fragDepthInCameraCoords = fragPosInCameraCoords.z - u_nearClip;
    int z = int(fragDepthInCameraCoords / fullDepth * u_zSlices);

    int miniFrustumIndex = x + y * int(u_xSlices) + z * int(u_xSlices) * int(u_ySlices);

    // ExtractFloat(sampler2D texture, int textureWidth, int textureHeight, int index, int component)
    int miniFrustumNumLights = int(ExtractFloat(u_clusterbuffer, u_clusterTextureWidth, u_clusterTextureHeight, miniFrustumIndex, 0));

    vec3 fragColor = vec3(0.0);

    // Cannot iterate over miniFrustumNumLights because
    // ERROR: 0:125: 'i' : Loop index cannot be compared with non-constant expression
    // We're still good to iterate over all lights, since no miniFrustum can have
    // more than params.numLights lights.
    for (int i = 0; i < ${params.numLights}; ++i) {
      if (i > miniFrustumNumLights) {
        break;
      }

      int lightIndex = int(ExtractFloat(u_clusterbuffer, u_clusterTextureWidth, u_clusterTextureHeight, miniFrustumIndex, i+1));

      Light light = UnpackLight(lightIndex);
      float lightDistance = distance(light.position, v_position);
      vec3 L = (light.position - v_position) / lightDistance;

      float lightIntensity = cubicGaussian(2.0 * lightDistance / light.radius);
      float lambertTerm = max(dot(L, normal), 0.0);

      fragColor += albedo * lambertTerm * light.color * vec3(lightIntensity);
    }

    const vec3 ambientLight = vec3(0.025);
    fragColor += albedo * ambientLight;

    gl_FragColor = vec4(fragColor, 1.0);
  }`;
}
