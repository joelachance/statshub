/** @type {import('next').NextConfig} */
export default {
  // Lets `npm run verify` build into a separate directory so it can't clobber
  // a running `next dev` server's .next output.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};
