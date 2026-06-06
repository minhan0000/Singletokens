import { DemoOne } from "@/components/demo/shader-background-demo";

export default function Home() {
  return (
    <main className="relative min-h-screen flex items-center justify-center">
      <DemoOne />
      <div className="relative z-10 text-center text-white">
        <h1 className="text-5xl font-bold mb-4 drop-shadow-lg">SingleTokens</h1>
        <p className="text-xl opacity-80 drop-shadow">WebGL Shader Background Demo</p>
      </div>
    </main>
  );
}
