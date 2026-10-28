# Hướng dẫn cho AI coding agent

- Nội dung: chỉ sửa `lib/data/portfolio.ts`. Quỹ đạo (`planet.orbit`) cách nhau ≥ 9 và tránh vùng vành đai tiểu hành tinh giữa Sao Hoả và Sao Mộc (47–55, `BELT_R` trong engine).
- Logic 3D: `lib/space/SpaceEngine.ts` (không dùng React); shader ở `lib/space/shaders.ts`. Không đưa state theo-frame vào React.
- Trong vòng lặp `tick()` KHÔNG tạo `new THREE.*`: dùng các biến `_v`, `_v2`… có sẵn.
- Vật thể lặp lại nhiều → `InstancedMesh`; hiệu ứng hạt → `Points` + shader.
- Kiểm tra: `npm run lint && npm run build`. Trên trình duyệt: chờ `main[data-ready="true"]`, gọi `__portfolio.start()`,
  chờ `__portfolio.getState().flying === false` rồi mới chụp màn hình.
