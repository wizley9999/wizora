import fs from "fs";
import path from "path";
import matter from "gray-matter";
import yaml from "js-yaml";
import { Marked } from "marked";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js";

const CONTENT_DIR = "content";
const OUTPUT_DIR = "public";
const TEMPLATE_DIR = "templates";

const CONFIG_PATH = "config.yaml";

const config = yaml.load(fs.readFileSync(CONFIG_PATH, "utf-8"));

const marked = new Marked(
  markedHighlight({
    emptyLangClass: "hljs",
    langPrefix: "hljs language-",
    highlight(code, lang, _) {
      const language = hljs.getLanguage(lang) ? lang : "plaintext";
      return hljs.highlight(code, { language }).value;
    },
  })
);

const renderer = {
  link(href, title, text) {
    const link = marked.Renderer.prototype.link.call(this, href, title, text);
    return link.replace("<a", "<a target='_blank' rel='noreferrer' ");
  },
};

marked.use({
  renderer,
});

function loadTemplate(template) {
  return fs.readFileSync(path.join(TEMPLATE_DIR, `${template}.html`), "utf-8");
}

function renderTemplate(template, variables) {
  return template.replace(/{{(\w+)}}/g, (_, key) => variables[key] || "");
}

function cleanDirectory(directory, excludes = []) {
  if (!fs.existsSync(directory)) return;

  const files = fs.readdirSync(directory);

  files.forEach((file) => {
    const filePath = path.join(directory, file);

    if (excludes.includes(file)) {
      return;
    }

    if (fs.statSync(filePath).isDirectory()) {
      fs.rmSync(filePath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(filePath);
    }
  });
}

function generateIndexPage() {
  const baseTemplate = loadTemplate("base");
  const headerTemplate = loadTemplate("header");
  const mainTemplate = loadTemplate("main");

  const header = renderTemplate(headerTemplate, {
    name: config.author.name,
    github: config.author.github,
  });

  const content = renderTemplate(mainTemplate);

  const page = renderTemplate(baseTemplate, {
    title: config.author.name,
    description: `All the latest ${config.author.name} posts, straight from the head.`,
    url: config.base,
    ogImage: `${config.base}/og-image.png`,
    header,
    content,
  });

  fs.writeFileSync(path.join(OUTPUT_DIR, "index.html"), page);
}

function generateArticlesPage() {
  const baseTemplate = loadTemplate("base");
  const headerTemplate = loadTemplate("header");
  const footerTemplate = loadTemplate("footer");

  const postListTemplate = loadTemplate("articles/post-list");
  const postItemTemplate = loadTemplate("articles/post-item");

  const header = renderTemplate(headerTemplate, {
    name: config.author.name,
    github: config.author.github,
  });

  const footer = renderTemplate(footerTemplate, {
    year: new Date().getFullYear(),
    name: config.author.name,
  });

  const postDirs = fs.readdirSync(CONTENT_DIR);

  const postItems = postDirs
    .map((dir) => {
      const postPath = path.join(CONTENT_DIR, dir, "index.md");
      if (!fs.existsSync(postPath)) return "";

      const { data: metadata, content: content } = matter(
        fs.readFileSync(postPath, "utf-8")
      );

      const postDate = new Date(metadata.date);

      return {
        date: postDate,
        html: renderTemplate(postItemTemplate, {
          localeDate: postDate.toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          }),
          title: metadata.title,
          preview: marked
            .parse(content)
            .replace(/<[^>]*>/g, "")
            .slice(0, 300),
          slug: `/articles/${dir}`,
        }),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.date - a.date)
    .map((post) => post.html)
    .join("\n");

  const content = renderTemplate(postListTemplate, {
    name: config.author.name,
    posts: postItems,
  });

  const page = renderTemplate(baseTemplate, {
    title: config.author.name,
    description: `All the latest ${config.author.name} posts, straight from the head.`,
    url: config.base,
    ogImage: `${config.base}/og-image.png`,
    header,
    content,
    footer,
  });

  const outputDir = path.join(OUTPUT_DIR, "articles");

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(path.join(outputDir, "index.html"), page);
}

function generatePostPage() {
  const baseTemplate = loadTemplate("base");
  const headerTemplate = loadTemplate("header");
  const footerTemplate = loadTemplate("footer");

  const postDetailTemplate = loadTemplate("articles/post-detail");

  const header = renderTemplate(headerTemplate, {
    name: config.author.name,
    github: config.author.github,
  });

  const footer = renderTemplate(footerTemplate, {
    year: new Date().getFullYear(),
    name: config.author.name,
  });

  const postDirs = fs.readdirSync(CONTENT_DIR);

  postDirs.forEach((dir) => {
    const postPath = path.join(CONTENT_DIR, dir);
    const postFiles = fs.readdirSync(postPath);

    const indexPath = path.join(postPath, "index.md");
    if (!fs.existsSync(indexPath)) return;

    const outputDir = path.join(`${OUTPUT_DIR}/articles`, dir);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    postFiles.forEach((file) => {
      if (file !== "index.md") {
        const srcPath = path.join(postPath, file);
        const destPath = path.join(outputDir, file);
        fs.copyFileSync(srcPath, destPath);
      }
    });

    const { data: metadata, content: content } = matter(
      fs.readFileSync(indexPath, "utf-8")
    );

    const postContent = renderTemplate(postDetailTemplate, {
      date: metadata.date,
      localeDate: new Date(metadata.date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
      title: metadata.title,
      github: config.author.github,
      name: config.author.name,
      content: marked.parse(content),
      repo: config.giscus.repo,
      repoId: config.giscus.repoId,
      category: config.giscus.category,
      categoryId: config.giscus.categoryId,
      mapping: config.giscus.mapping,
      reactionsEnabled: config.giscus.reactionsEnabled,
      inputPosition: config.giscus.inputPosition,
      theme: config.giscus.theme,
      lang: config.giscus.lang,
    });

    const page = renderTemplate(baseTemplate, {
      title: `${metadata.title} - ${config.author.name}`,
      description: marked
        .parse(content)
        .replace(/<[^>]*>/g, "")
        .slice(0, 120),
      url: `${config.base}/articles/${dir}`,
      ogImage: `${config.base}/og-image.png`,
      header,
      content: postContent,
      footer,
    });

    fs.writeFileSync(path.join(outputDir, "index.html"), page);
  });
}

function generateSitemap() {
  const postDirs = fs.readdirSync(CONTENT_DIR);

  const urls = postDirs
    .map((dir) => {
      const postPath = path.join(CONTENT_DIR, dir);
      const indexPath = path.join(postPath, "index.md");

      if (!fs.existsSync(indexPath)) return null;

      const postUrl = `/articles/${dir}`;
      return {
        loc: `${config.base}${postUrl}`,
        lastmod: new Date(
          matter(fs.readFileSync(indexPath, "utf-8")).data.date
        ).toISOString(),
      };
    })
    .filter(Boolean);

  const sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    ${urls
      .map(
        (url) => `
      <url>
        <loc>${url.loc}</loc>
        <lastmod>${url.lastmod}</lastmod>
      </url>`
      )
      .join("")}
  </urlset>`;

  fs.writeFileSync(path.join(OUTPUT_DIR, "sitemap.xml"), sitemapContent);
}

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR);
}

cleanDirectory("public", [
  "fonts",
  "styles",
  "favicon.ico",
  "og-image.png",
  "robots.txt",
]);

generateIndexPage();
generateArticlesPage();
generatePostPage();
generateSitemap();
