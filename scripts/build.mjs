import { cp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await cp("web", "dist", { recursive: true });
const html = (await readFile("web/index.html", "utf8")).replace(
  '<html lang="zh-CN">',
  '<html lang="zh-CN" data-build="static">',
);
await writeFile("dist/index.html", html);
await writeFile("dist/.nojekyll", "");
await writeFile(
  "dist/.gitattributes",
  "* text=auto eol=lf\n*.png binary\n*.jpg binary\n*.mp3 binary\n*.mp4 binary\n",
);
console.log(
  "Static demo built: dist/ (no credentials or server files included)",
);
