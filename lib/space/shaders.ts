/**
 * Shader GLSL cho vũ trụ. Mọi bề mặt (mặt trời, hành tinh khí, dung nham, băng, tinh vân)
 * đều sinh bằng nhiễu toán học ngay trên GPU, không cần file ảnh → nhẹ và sắc nét ở mọi độ zoom.
 */

/** Simplex noise 3D (Ashima Arts / Stefan Gustavson, MIT) + fbm nhiều tầng */
export const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
// fbm: cộng nhiều tầng nhiễu, mỗi tầng chi tiết gấp đôi, yếu bằng nửa → bề mặt tự nhiên
float fbm(vec3 p){
  float f=0.0, a=0.5;
  for(int i=0;i<5;i++){ f+=a*snoise(p); p*=2.03; a*=0.5; }
  return f*0.5+0.5;
}
// Nhiễu "gờ": tạo đường nứt / gân sáng
float ridged(vec3 p){
  float f=0.0, a=0.5;
  for(int i=0;i<4;i++){ f+=a*(1.0-abs(snoise(p))); p*=2.1; a*=0.5; }
  return f;
}
`;

/** Vertex chung cho hành tinh: truyền toạ độ trên mặt cầu (để lấy nhiễu) + pháp tuyến thế giới */
export const PLANET_VERT = /* glsl */ `
varying vec3 vPos;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
void main(){
  vPos = normalize(position);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

/** Ánh sáng dùng chung: mặt trời ở gốc toạ độ */
const LIGHT = /* glsl */ `
uniform float uTime;
varying vec3 vPos;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
struct Light { float diff; float rim; float spec; vec3 N; vec3 L; vec3 V; };
Light light(float shininess){
  Light o;
  o.N = normalize(vWorldNormal);
  o.L = normalize(-vWorldPos);
  o.V = normalize(cameraPosition - vWorldPos);
  float ndl = dot(o.N, o.L);
  o.diff = clamp((ndl + 0.06) / 1.06, 0.0, 1.0);        // vùng tranh tối tranh sáng mềm
  o.rim = pow(1.0 - max(dot(o.N, o.V), 0.0), 3.0);
  vec3 H = normalize(o.L + o.V);
  o.spec = pow(max(dot(o.N, H), 0.0), shininess) * step(0.0, ndl);
  return o;
}
`;

/** Hành tinh khí (Sao Kim, Sao Mộc, Sao Thổ, Sao Hải Vương): các dải mây xoáy + vết bão */
export const GAS_FRAG = /* glsl */ `
${NOISE}
${LIGHT}
uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3; uniform vec3 uC4;
uniform float uBands; uniform float uStorm; uniform vec3 uStormC;
void main(){
  Light l = light(20.0);
  vec3 p = vPos;
  float t = uTime * 0.012;
  // làm cong dải mây bằng nhiễu → xoáy nhiễu loạn
  float warp = fbm(p * 2.5 + vec3(t, 0.0, -t)) - 0.5;
  float lat = p.y + warp * 0.18 + (fbm(p * vec3(2.0, 14.0, 2.0) + t) - 0.5) * 0.06;
  float b = sin(lat * uBands) * 0.5 + 0.5;
  float b2 = sin(lat * uBands * 2.3 + 1.7) * 0.5 + 0.5;
  vec3 col = mix(uC1, uC2, smoothstep(0.2, 0.8, b));
  col = mix(col, uC3, smoothstep(0.55, 0.95, b2) * 0.6);
  col = mix(col, uC4, smoothstep(0.75, 1.0, abs(p.y)) * 0.7);   // vùng cực sẫm màu
  // vết bão xoáy lớn
  vec3 sc = normalize(vec3(0.75, -0.32, 0.55));
  float d = distance(p, sc);
  float swirl = fbm(p * 9.0 + d * 6.0 - uTime * 0.05);
  float storm = smoothstep(0.24, 0.1, d + (swirl - 0.5) * 0.08) * uStorm;
  col = mix(col, uStormC * (0.8 + swirl * 0.4), storm);
  vec3 lit = col * (l.diff * 1.15 + 0.015);
  lit += vec3(0.9, 0.7, 0.5) * l.rim * l.diff * 0.25;   // viền khí quyển phía được chiếu sáng
  gl_FragColor = vec4(lit, 1.0);
}
`;

/** Sao Hoả: đất gỉ sét, vùng đá sẫm, hẻm núi và chỏm băng ở 2 cực */
export const MARS_FRAG = /* glsl */ `
${NOISE}
${LIGHT}
void main(){
  Light l = light(12.0);
  vec3 p = vPos;
  float n = fbm(p * 3.0);
  vec3 col = mix(vec3(0.52, 0.2, 0.09), vec3(0.8, 0.43, 0.22), smoothstep(0.3, 0.75, n));
  col = mix(col, vec3(0.24, 0.12, 0.08), smoothstep(0.55, 0.8, fbm(p * 1.6 + 3.0)) * 0.75);   // vùng đá sẫm
  col *= 0.8 + 0.25 * smoothstep(0.7, 0.95, ridged(p * 5.0));                                   // hẻm núi, miệng hố
  col = mix(col, vec3(0.95, 0.93, 0.9), smoothstep(0.93, 0.97, abs(p.y) + (n - 0.5) * 0.08));   // chỏm băng
  vec3 lit = col * (l.diff * 1.1 + 0.015);
  lit += vec3(1.0, 0.55, 0.35) * l.rim * l.diff * 0.3;   // bụi trong khí quyển mỏng
  gl_FragColor = vec4(lit, 1.0);
}
`;

/** Trái Đất: ảnh ngày/đêm thật + đại dương phản chiếu + ánh đèn thành phố ở mặt tối */
export const EARTH_FRAG = /* glsl */ `
${LIGHT}
uniform sampler2D uDay; uniform sampler2D uNight; uniform sampler2D uSpec;
varying vec2 vUv;
void main(){
  Light l = light(80.0);
  vec3 day = texture2D(uDay, vUv).rgb;
  vec3 night = texture2D(uNight, vUv).rgb;
  float ocean = texture2D(uSpec, vUv).r;
  float ndl = dot(l.N, l.L);
  float dayMix = smoothstep(-0.12, 0.22, ndl);
  vec3 dayCol = day * (l.diff * 1.2 + 0.01) + vec3(1.0, 0.95, 0.85) * l.spec * ocean * 0.3;
  vec3 nightCol = night * vec3(1.0, 0.8, 0.5) * 2.2;
  vec3 col = mix(nightCol, dayCol, dayMix);
  col += vec3(0.3, 0.55, 1.0) * l.rim * dayMix * 0.6;
  gl_FragColor = vec4(col, 1.0);
}
`;
export const EARTH_VERT = /* glsl */ `
varying vec3 vPos; varying vec3 vWorldPos; varying vec3 vWorldNormal; varying vec2 vUv;
void main(){
  vUv = uv;
  vPos = normalize(position);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

/** Mặt trời: hạt plasma sôi + tối dần ở rìa (limb darkening). Giá trị > 1 → bloom toả sáng */
export const SUN_FRAG = /* glsl */ `
${NOISE}
uniform float uTime;
varying vec3 vPos; varying vec3 vWorldPos; varying vec3 vWorldNormal;
void main(){
  vec3 p = vPos;
  float n = fbm(p * 3.5 + vec3(0.0, uTime * 0.04, 0.0));
  float g = fbm(p * 14.0 - vec3(uTime * 0.08));
  float spots = smoothstep(0.62, 0.7, fbm(p * 2.0 + 10.0 + uTime * 0.01));
  float heat = clamp(n * 0.75 + g * 0.45 - spots * 0.35, 0.0, 1.0);
  vec3 col = mix(vec3(1.0, 0.32, 0.04), vec3(1.0, 0.82, 0.42), heat);
  col = mix(col, vec3(1.0, 0.98, 0.9), smoothstep(0.75, 1.0, heat));
  vec3 V = normalize(cameraPosition - vWorldPos);
  float mu = max(dot(normalize(vWorldNormal), V), 0.0);
  col *= 0.45 + 0.55 * pow(mu, 0.5);
  gl_FragColor = vec4(col * 3.2, 1.0);
}
`;

/** Bầu khí quyển: vỏ cầu lớn hơn, chỉ vẽ mặt sau, sáng ở rìa và chỉ phía được mặt trời chiếu */
export const ATMO_VERT = /* glsl */ `
varying vec3 vNormalView; varying vec3 vWorldNormal; varying vec3 vWorldPos;
void main(){
  vNormalView = normalize(normalMatrix * normal);
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
export const ATMO_FRAG = /* glsl */ `
uniform vec3 uColor; uniform float uStrength; uniform float uSunlit;
varying vec3 vNormalView; varying vec3 vWorldNormal; varying vec3 vWorldPos;
void main(){
  // Mặt sau của vỏ cầu: ở rìa ngoài dot ≈ 0 (mờ hẳn), càng vào sát hành tinh càng đậm
  float d = dot(vNormalView, vec3(0.0, 0.0, 1.0));
  float i = pow(smoothstep(0.0, 0.55, -d), 1.6);
  float sun = smoothstep(-0.35, 0.45, dot(normalize(vWorldNormal), normalize(-vWorldPos)));
  float k = i * uStrength * mix(1.0, sun, uSunlit);
  gl_FragColor = vec4(uColor * k, k);
}
`;

/** Vành đai hành tinh: dải sáng tối theo bán kính, nhạt dần ở mép */
export const RING_VERT = /* glsl */ `
varying vec3 vLocal; varying vec3 vWorldPos;
void main(){
  vLocal = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
export const RING_FRAG = /* glsl */ `
${NOISE}
uniform float uInner; uniform float uOuter; uniform vec3 uColor;
uniform vec3 uPlanetPos; uniform float uPlanetR;
varying vec3 vLocal; varying vec3 vWorldPos;
void main(){
  float r = length(vLocal.xy);
  float t = (r - uInner) / (uOuter - uInner);
  float bands = snoise(vec3(t * 40.0, 0.0, 0.0)) * 0.5 + 0.5;
  bands = mix(bands, snoise(vec3(t * 140.0, 3.0, 0.0)) * 0.5 + 0.5, 0.35);
  float gap = smoothstep(0.58, 0.6, t) * (1.0 - smoothstep(0.64, 0.66, t)); // khe Cassini
  float a = smoothstep(0.0, 0.06, t) * (1.0 - smoothstep(0.92, 1.0, t)) * (0.35 + bands * 0.65) * (1.0 - gap * 0.85);
  // bóng của hành tinh đổ lên vành đai
  vec3 toSun = normalize(-uPlanetPos);
  vec3 rel = vWorldPos - uPlanetPos;
  float along = dot(rel, toSun);
  float perp = length(rel - toSun * along);
  float shadow = (along < 0.0) ? smoothstep(uPlanetR * 0.92, uPlanetR * 1.05, perp) : 1.0;
  vec3 col = uColor * (0.55 + bands * 0.6) * (0.08 + 0.92 * shadow);
  gl_FragColor = vec4(col, a * 0.85);
}
`;

/** Bầu trời tinh vân: mây khí tím xanh rất mờ phía sau các vì sao */
export const NEBULA_FRAG = /* glsl */ `
${NOISE}
varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir);
  float n = fbm(d * 2.2);
  float n2 = fbm(d * 4.5 + 7.0);
  float band = exp(-pow(d.y * 2.6 + (n - 0.5) * 0.9, 2.0)); // dải ngân hà vắt ngang
  vec3 col = vec3(0.006, 0.008, 0.022);
  col += vec3(0.16, 0.05, 0.24) * smoothstep(0.45, 0.85, n) * 0.55;
  col += vec3(0.05, 0.12, 0.3) * smoothstep(0.5, 0.9, n2) * 0.45;
  col += vec3(0.5, 0.3, 0.45) * pow(n2, 4.0) * band * 0.35;
  col += vec3(0.18, 0.16, 0.22) * band * n * 0.25;
  gl_FragColor = vec4(col, 1.0);
}
`;
export const NEBULA_VERT = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** Hạt sao/thiên hà: điểm tròn mềm, cỡ theo khoảng cách, nhấp nháy */
export const POINTS_VERT = /* glsl */ `
uniform float uTime; uniform float uPixelRatio; uniform float uScale;
uniform float uSpin; uniform float uHoleR;
attribute float aSize; attribute vec3 aColor; attribute vec3 aPolar; // (bán kính, góc, độ cao)
varying vec3 vColor; varying float vAlpha;
void main(){
  // Thiên hà quay vi sai: sao gần lõi quay nhanh hơn sao ở rìa (giống thực tế)
  float r = aPolar.x;
  float ang = aPolar.y + uTime * uSpin / (0.15 + r * 0.004);
  vec3 pos = (uSpin == 0.0) ? position : vec3(cos(ang) * r, aPolar.z, sin(ang) * r);
  vec4 world = modelMatrix * vec4(pos, 1.0);
  vec4 mv = viewMatrix * world;
  gl_Position = projectionMatrix * mv;
  float tw = 0.75 + 0.25 * sin(uTime * (1.0 + aSize) + aPolar.y * 50.0);
  gl_PointSize = max(aSize * uScale * uPixelRatio * (300.0 / -mv.z), 1.0);
  vColor = aColor * tw;
  // ẩn các sao của thiên hà nằm sát hệ mặt trời (tránh rối mắt khi ở gần)
  vAlpha = (uHoleR > 0.0) ? smoothstep(uHoleR, uHoleR * 1.8, length(world.xyz)) : 1.0;
}
`;
export const POINTS_FRAG = /* glsl */ `
varying vec3 vColor; varying float vAlpha;
void main(){
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  a = a * a * vAlpha;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vColor * a, a);
}
`;
