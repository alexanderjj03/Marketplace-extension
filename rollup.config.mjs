import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
  input: 'contentScript.js',
  output: {
    file: 'dist/contentScript.bundle.js',
    format: 'iife', // Immediately Invoked Function Expression for browser use
    name: 'ContentScriptBundle'
  },
  plugins: [resolve(), commonjs()]
};