// save as generate-icons.js
const fs = require('fs');
const { createCanvas } = require('canvas');

const sizes = [16, 32, 48, 64, 128];
sizes.forEach(size => {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Blue background
  ctx.fillStyle = '#4267B2'; // Facebook blue
  ctx.fillRect(0, 0, size, size);

  // White "M" in center
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `${size * 0.6}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('M', size/2, size/2);

  fs.writeFileSync(`icon${size}.png`, canvas.toBuffer());
});

console.log('Generated icon files');