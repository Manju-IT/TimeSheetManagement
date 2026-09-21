function Header({
  title,
  subtitle,
  children,
}) {
  return (
    <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {title}
        </h1>

        {subtitle && (
          <p className="mt-1 text-sm text-slate-500">
            {subtitle}
          </p>
        )}
      </div>

      {children && (
        <div className="flex flex-wrap gap-2">
          {children}
        </div>
      )}
    </div>
  );
}

export default Header;