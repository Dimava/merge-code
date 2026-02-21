import homepage from './pages/index.html';

const server = Bun.serve({
  port: 3000,
  routes: {
    '/': homepage
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log(`Server running at ${server.url}`);
