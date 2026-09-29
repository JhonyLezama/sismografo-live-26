import { Search, X } from "lucide-react";

interface Props {
  id: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
}

/* Caja de búsqueda por lugar: tolera tildes y mayúsculas, Enter localiza */
export default function SearchBox({ id, value, onChange, onSubmit, placeholder }: Props) {
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.();
      }}
      className="flex w-full max-w-xl items-center gap-2 border border-line bg-panel px-3 py-2.5 focus-within:border-teal"
    >
      <Search size={15} strokeWidth={2} className="shrink-0 text-dim" aria-hidden />
      <label htmlFor={id} className="sr-only">
        {placeholder ?? "Buscar por lugar"}
      </label>
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "¿Tembló en…? Escribe un país o lugar"}
        autoComplete="off"
        enterKeyHint="search"
        className="min-w-0 flex-1 bg-transparent text-sm text-bone outline-none placeholder:text-dim [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Limpiar búsqueda"
          className="chip-btn grid h-6 w-6 shrink-0 place-items-center border border-line text-dim hover:border-verm hover:text-verm"
        >
          <X size={12} strokeWidth={2} />
        </button>
      )}
    </form>
  );
}
