export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="rounded-3xl border border-slate-200 bg-white/80 p-8 shadow-sm">
        <h1 className="text-3xl font-semibold text-slate-900">Privacy & data handling</h1>
        <div className="mt-6 space-y-4 text-sm leading-6 text-slate-700">
          <p>EduGuard stores account information, class records, assignment metadata, reports, and communication records required to operate academic integrity and marking workflows.</p>
          <p>Uploaded files are intended to be stored in managed backend storage such as S3 rather than inside the shared frontend project. Temporary processing files may still be created on the server while reports are generated.</p>
          <p>Access to reports and marked feedback is controlled by role and assignment settings. Student-facing report visibility depends on lecturer publishing choices where applicable.</p>
          <p>For operational questions about storage, retention, or deployment, contact <a className="text-indigo-600 hover:underline" href="mailto:support@eduguard.app">support@eduguard.app</a>.</p>
        </div>
      </div>
    </div>
  );
}
