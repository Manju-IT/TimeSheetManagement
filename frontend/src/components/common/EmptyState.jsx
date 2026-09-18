function EmptyState({ title, description, action }) {
	return (
		<div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
			<h2 className="font-semibold text-slate-800">{title}</h2>
			{description && <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{description}</p>}
			{action && <div className="mt-4">{action}</div>}
		</div>
	);
}

export default EmptyState;
