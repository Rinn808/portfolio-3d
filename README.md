# 🌌 Vũ trụ Portfolio – Next.js + Three.js

Portfolio 3D của **Hồ Viết Bảo (Rinn808)**. Mở màn ngoài một thiên hà xoắn ốc, bay vào hệ mặt trời;
7 hành tinh theo đúng thứ tự thật, mỗi hành tinh là một phần CV. Trái Đất chính là CV (kèm Mặt Trăng quay quanh).

## Chạy trên Macbook

```bash
# Cần Node.js 20+  (cài nhanh: brew install node)
npm install
npm run dev          # mở http://localhost:3000
npm run build        # build production
```

## Điều khiển

| Thao tác | Tác dụng |
|---|---|
| Kéo chuột / 1 ngón | Xoay góc nhìn |
| Cuộn chuột / vuốt 2 ngón trackpad | Zoom |
| Bấm hành tinh, nhãn hoặc thanh dưới cùng | Bay tới hành tinh & mở thông tin |
| `←` `→` | Hành tinh trước / sau |
| `Esc` hoặc "✦ Toàn cảnh" | Về toàn cảnh hệ mặt trời |
| `` ` `` (backtick) | Bật/tắt Dev workspace (FPS, draw calls…) |

## Sửa nội dung

Chỉ cần sửa **`lib/data/portfolio.ts`**. Mỗi trạm có `planet: { type, radius, orbit, start }`:
- `type`: `mercury` | `venus` | `earth` | `mars` | `jupiter` | `saturn` | `neptune`
- `orbit`: bán kính quỹ đạo (mặt trời bán kính 7, vành đai tiểu hành tinh ở ~51 → tránh 47–55)
- `image`, `facts`: ảnh đầu panel và bảng thông tin (ảnh, CV PDF nằm trong `public/profile/`)

| Hành tinh | Trạm |
|---|---|
| Sao Thuỷ | Về mình |
| Sao Kim | Kỹ năng |
| Trái Đất | CV |
| Sao Hoả | Aurelian POS |
| Sao Mộc | Vice Rush 3D |
| Sao Thổ | dhvWeb |
| Sao Hải Vương | Liên hệ |

`title` là tên hành tinh (hiện trên nhãn 3D và thanh điều hướng); tên trạm nằm trong `subtitle`.

## Cấu trúc

```
app/                      Next.js App Router (layout, page, CSS)
components/
  ClientPortfolio.tsx     dynamic import, ssr:false (WebGL chỉ chạy ở trình duyệt)
  Space3D.tsx             UI React (intro, panel, thanh hành tinh, Dev) + Agent API
lib/space/
  SpaceEngine.ts          Toàn bộ vũ trụ bằng Three.js thuần
  shaders.ts              GLSL: nhiễu simplex/fbm, mặt trời, hành tinh, khí quyển, vành đai, tinh vân, hạt sao
lib/data/portfolio.ts     Nội dung portfolio
public/space/             Ảnh Trái Đất & Mặt Trăng (từ three.js examples)
```

## Đồ hoạ được làm thế nào?

- **Thiên hà**: 35k–120k hạt (tuỳ máy), 4 nhánh xoắn + lõi phình. Quay *vi sai* (gần lõi quay nhanh hơn) tính ngay trong vertex shader nên CPU không tốn gì.
- **Mặt trời**: shader nhiễu fbm động (hạt plasma, vết đen, tối dần ở rìa) + 3 lớp quầng sáng + Bloom.
- **Hành tinh**: Trái Đất dùng ảnh thật (ngày, đêm có đèn thành phố, đại dương phản chiếu, mây riêng 1 lớp) và có Mặt Trăng. Sao Thuỷ dùng ảnh Mặt Trăng nhuộm màu. Các hành tinh còn lại sinh bằng nhiễu trên GPU: Sao Kim phủ mây vàng, Sao Hoả đất gỉ sét có chỏm băng, Sao Mộc có dải mây và vết đỏ lớn, Sao Thổ có vành với khe Cassini và bóng hành tinh đổ lên, Sao Hải Vương xanh với vết tối lớn.
- **Khí quyển**: vỏ cầu chỉ vẽ mặt sau, sáng ở rìa và chỉ phía được mặt trời chiếu.
- **Vành đai tiểu hành tinh**: 900–2200 hòn đá, `InstancedMesh` → 1 draw call.
- **Giao diện**: bề mặt đặc thay cho kính mờ (`backdrop-filter` trên canvas WebGL bắt GPU làm mờ lại mỗi frame).
- **Hậu kỳ**: `EffectComposer` → `UnrealBloomPass` → `OutputPass` (ACES tone mapping), MSAA 4x.

## Vì sao mượt?

1. Engine tách khỏi React: React chỉ re-render khi chọn hành tinh, không phải mỗi frame.
2. Mọi chuyển động của thiên hà, sao, bề mặt hành tinh chạy trên GPU (shader).
3. Giới hạn DPR (màn Retina vẽ gấp 4 lần pixel); bloom ở nửa độ phân giải với máy yếu.
4. Chế độ `auto`: FPS < 40 trong 2 giây → tự hạ chất lượng.
5. Dừng render khi ẩn tab. Delta time → mượt trên màn 60Hz lẫn 120Hz (ProMotion).

## Agent API (cho dev / AI agent trên trình duyệt)

Mở DevTools Console (`⌘ + ⌥ + J`):

```js
__portfolio.start()                // bỏ qua màn intro, bay vào hệ mặt trời
__portfolio.listStations()         // danh sách hành tinh
__portfolio.focus("project-game")  // bay tới hành tinh + mở panel
__portfolio.overview()             // về toàn cảnh
__portfolio.setQuality("low")      // "auto" | "low" | "medium" | "high"
__portfolio.getState()             // { fps, drawCalls, camera, flying, focusId, openId, ... }
```

## Ghi công

- Ảnh Trái Đất và Mặt Trăng: lấy từ thư mục `examples/textures/planets` của [three.js](https://github.com/mrdoob/three.js) (MIT).
