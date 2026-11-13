import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: 'src/index.ts',
        'adapters/react/index': 'src/adapters/react/index.ts',
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    minify: false,
    rolldownOptions: {
      external: id => id === 'react' || id.startsWith('react/'),
    },
  },
});
