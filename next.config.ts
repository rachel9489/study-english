import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 允许华为平板等设备通过局域网 IP 访问开发服务器
  allowedDevOrigins: ["192.168.31.61", "172.31.112.1"],
};

export default nextConfig;
