// 👉 Sửa thông tin của bạn ở ĐÂY. Mọi trạm (station) trong thế giới 3D được sinh ra từ file này.
// Nội dung lấy từ CV (Documents/my profile/cv.html) và https://github.com/Rinn808

export type StationKind = "about" | "cv" | "skills" | "project" | "contact";

/** 7 hành tinh theo thứ tự thật tính từ mặt trời (bỏ Sao Thiên Vương) */
export type PlanetType = "mercury" | "venus" | "earth" | "mars" | "jupiter" | "saturn" | "neptune";

export interface PlanetSpec {
  type: PlanetType;
  /** Bán kính hành tinh */
  radius: number;
  /** Bán kính quỹ đạo quanh mặt trời */
  orbit: number;
  /** Góc xuất phát trên quỹ đạo (radian) */
  start: number;
}

export interface Station {
  id: string;
  kind: StationKind;
  /** Tên hành tinh: hiện trên nhãn 3D, thanh điều hướng và tiêu đề panel */
  title: string;
  subtitle: string;
  description: string;
  /** Ảnh đầu panel (đường dẫn trong /public) */
  image?: string;
  /** Bảng thông tin dạng nhãn – giá trị (dùng cho CV, kỹ năng) */
  facts?: { label: string; value: string }[];
  /** Các ý chính, hiện dạng gạch đầu dòng trong panel */
  highlights?: string[];
  tags?: string[];
  links?: { label: string; href: string }[];
  /** Hành tinh đại diện trong vũ trụ 3D */
  planet: PlanetSpec;
  /** Màu chủ đạo của trạm (hex): dùng cho nhãn, quỹ đạo, panel */
  color: string;
}

const GITHUB = "https://github.com/Rinn808";
const EMAIL = "hovietbao11@gmail.com";
const CV_EMAIL = "2305CT2357@dhv.edu.vn";
const CV_PDF = "/profile/cv.pdf";

export const profile = {
  name: "Hồ Viết Bảo",
  handle: "Rinn808",
  role: "Sinh viên IT · Fullstack Web & 3D",
  avatar: "/profile/bao-face.jpg",
  tagline:
    "Mình thích biến ý tưởng thành sản phẩm chạy được: từ phần mềm bán hàng, web Java cho tới game 3D chạy ngay trên trình duyệt.",
  github: GITHUB,
  email: EMAIL,
  cv: CV_PDF,
};

export const stations: Station[] = [
  {
    id: "about",
    kind: "about",
    title: "Sao Thuỷ",
    subtitle: "Về mình · Xin chào",
    description:
      "Mình là Bảo (Rinn808), sinh viên IT. Mình học bằng cách làm: mỗi môn học, mỗi ý tưởng đều thành một repo trên GitHub, từ Java Web, React đến Three.js.",
    highlights: [
      "Làm được cả frontend lẫn backend, có kết nối database thật",
      "Thích sản phẩm có tương tác: POS, game, chính portfolio 3D này",
      "Dùng AI để code nhanh hơn và học nhanh hơn",
    ],
    tags: ["Fullstack", "3D Web", "Vibe coding", "macOS"],
    planet: { type: "mercury", radius: 1.15, orbit: 13, start: 0.9 },
    color: "#c9b9a8",
  },
  {
    id: "skills",
    kind: "skills",
    title: "Sao Kim",
    subtitle: "Kỹ năng · Tech stack",
    description: "Công nghệ mình đã dùng trong các dự án thật trên GitHub.",
    highlights: [
      "Frontend: React, TypeScript, Vite, Next.js, HTML/CSS",
      "3D & game: Three.js, Cannon-es (vật lý)",
      "Backend: Node.js / Express, Java (JSP, JDBC, Maven)",
      "Database: MySQL, SQLite",
      "Khác: Python, Git, Tomcat",
    ],
    tags: ["TypeScript", "React", "Three.js", "Java", "Express", "MySQL", "Python"],
    planet: { type: "venus", radius: 1.9, orbit: 22, start: 2.6 },
    color: "#f3c27a",
  },
  {
    id: "cv",
    kind: "cv",
    title: "Trái Đất",
    subtitle: "CV · Hồ Viết Bảo · Tìm vị trí thực tập Web Developer",
    description:
      "Mình là Bảo, sinh viên lớp CT07PM ngành Công nghệ thông tin ở Đại học Hùng Vương TP.HCM. Mình làm web từ giao diện tới cơ sở dữ liệu: một quầy POS bán đồng hồ, một game 3D chạy trên trình duyệt, một hệ thống quản lý sinh viên bằng Java.",
    image: "/profile/bao-face.jpg",
    facts: [
      { label: "Học vấn", value: "Đại học Hùng Vương TP.HCM, ngành CNTT, lớp CT07PM (đang học)" },
      { label: "Dự án", value: "Aurelian Horologie (POS), Vice Rush 3D, dhvWeb, Quản lý môn học" },
      { label: "Frontend", value: "TypeScript, React, Vite, HTML, CSS, JSP, Three.js" },
      { label: "Backend", value: "Node.js, Express, Java Servlet, JDBC" },
      { label: "Database", value: "MySQL, SQLite" },
      { label: "Công cụ", value: "Git, GitHub, Maven, npm, Python" },
      { label: "Chứng chỉ", value: "Developing Secure Software (LFD121), The Linux Foundation · OpenSSF, 10/2026; Chứng chỉ nghề Tin học văn phòng" },
      { label: "Nơi ở", value: "TP. Hồ Chí Minh" },
      { label: "Email", value: CV_EMAIL },
    ],
    links: [
      { label: "Tải CV (PDF)", href: CV_PDF },
      { label: "Gửi email", href: `mailto:${CV_EMAIL}` },
    ],
    planet: { type: "earth", radius: 2.5, orbit: 31, start: 0.3 },
    color: "#6fa8ff",
  },
  {
    id: "project-watch",
    kind: "project",
    title: "Sao Hoả",
    subtitle: "Aurelian POS · Dự án watch_pos",
    description:
      "Phần mềm bán hàng (POS) cho cửa hàng đồng hồ cao cấp. Có quy trình bán tại quầy, hoá đơn và trang quản trị đầy đủ.",
    image: "/profile/thumb-pos.jpg",
    highlights: [
      "Giỏ hàng có ảnh sản phẩm; thanh toán bằng QR chuyển khoản, tiền mặt hoặc thẻ",
      "Hoá đơn bán hàng, hoá đơn đỏ (VAT), in hoá đơn",
      "Tích điểm khách hàng, giảm giá theo %",
      "Quản lý kho, sổ quỹ, báo cáo; phân quyền admin / nhân viên",
    ],
    tags: ["React", "Vite", "TypeScript", "Express", "MySQL"],
    links: [{ label: "Xem trên GitHub", href: `${GITHUB}/watch_pos` }],
    planet: { type: "mars", radius: 1.6, orbit: 41, start: 4.4 },
    color: "#ff7a4d",
  },
  {
    id: "project-game",
    kind: "project",
    title: "Sao Mộc",
    subtitle: "Vice Rush 3D · Dự án gameGTA6",
    description:
      "Game thế giới mở 3D chạy trên trình duyệt: đi bộ, lái xe, bị cảnh sát truy nã, có ngày/đêm và lưu tiến trình theo tài khoản.",
    image: "/profile/thumb-game.jpg",
    highlights: [
      "Lái xe có quán tính và drift, cướp xe, camera Pointer Lock",
      "Chu kỳ ngày/đêm 24 phút, hệ thống truy nã 1–5 sao",
      "Đăng ký / đăng nhập: mật khẩu băm scrypt, SQL dùng prepared statements",
      "Tự lưu vị trí, tiền, vũ khí mỗi 10 giây",
    ],
    tags: ["Three.js", "Cannon-es", "TypeScript", "Express", "SQLite"],
    links: [{ label: "Xem trên GitHub", href: `${GITHUB}/gameGTA6` }],
    planet: { type: "jupiter", radius: 4.4, orbit: 64, start: 1.6 },
    color: "#e9a873",
  },
  {
    id: "project-dhv",
    kind: "project",
    title: "Sao Thổ",
    subtitle: "dhvWeb · Đồ án Lập trình Web Java",
    description:
      "Ứng dụng web quản lý sinh viên viết bằng Java thuần, kèm báo cáo, slide thuyết trình và video demo.",
    image: "/profile/thumb-dhv.jpg",
    highlights: [
      "Đủ CRUD: thêm, xem danh sách, sửa, xoá sinh viên",
      "JSP + JDBC kết nối MySQL",
      "Build bằng Maven, chạy trên Tomcat",
    ],
    tags: ["Java 17", "JSP", "JDBC", "MySQL", "Maven"],
    links: [{ label: "Xem trên GitHub", href: `${GITHUB}/laptrinhweb-thigk-thaytan` }],
    planet: { type: "saturn", radius: 3.4, orbit: 79, start: 5.2 },
    color: "#e6cf95",
  },
  {
    id: "contact",
    kind: "contact",
    title: "Sao Hải Vương",
    subtitle: "Liên hệ · Cùng làm gì đó nhé",
    description: "Mình đang tìm cơ hội thực tập. Bạn có thể nhắn qua email hoặc xem thêm code trên GitHub.",
    links: [
      { label: "Gửi email", href: `mailto:${EMAIL}` },
      { label: "GitHub · Rinn808", href: GITHUB },
    ],
    planet: { type: "neptune", radius: 2.6, orbit: 93, start: 3.3 },
    color: "#6f93ff",
  },
];
