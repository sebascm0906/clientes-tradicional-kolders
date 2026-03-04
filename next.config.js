/** @type {import('next').NextConfig} */

const withSerwist = require('@serwist/next').default({
    swSrc: 'src/app/sw.ts',
    swDest: 'public/sw.js',
    reloadOnOnline: true,
    disable: process.env.NODE_ENV === 'development', // Solo en prod
});

const nextConfig = {
    reactStrictMode: true,
    images: {
        unoptimized: true
    }
};

module.exports = withSerwist(nextConfig);
