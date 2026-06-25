-- 00049 — raise the documents bucket size limit to 50MB (doc-ingest #26).
--
-- The doc-ingest endpoint could only accept files ≤4MB because Vercel caps
-- serverless request bodies at ~4.5MB. Real ICC loan packages are 5.3–8.1MB
-- (and appraisals run 20–50MB), so they 413'd. The fix is signed/direct
-- browser→Supabase-Storage upload (bypasses the Vercel body cap); the server
-- then reads the file from storage and forwards it to Claude. That path is
-- bounded by the BUCKET's file_size_limit, not Vercel — bump it from 10MB to
-- 50MB so real packages + appraisals fit. (Claude's own PDF cap is 32MB /
-- ~100 pages per request; the route guards for that separately.)

update storage.buckets
  set file_size_limit = 50 * 1024 * 1024
  where id = 'documents';
