"use client";

import dynamic from "next/dynamic";

// ssr: false → WebGL chỉ chạy trên trình duyệt, server không phải render canvas
const Space3D = dynamic(() => import("./Space3D"), {
  ssr: false,
  loading: () => (
    <div className="loader">
      <div className="spinner" />
      <p>Đang tải…</p>
    </div>
  ),
});

export default function ClientPortfolio() {
  return <Space3D />;
}
