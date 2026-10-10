import {
  Children,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useId,
  useRef,
} from "react";
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";

type ContentProps = HTMLAttributes<HTMLDivElement>;
const DialogContext = createContext<{
  close: () => void;
  titleId: string;
  descriptionId: string;
} | null>(null);
export function Dialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    titleId = useId(),
    descriptionId = useId();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);
  return (
    <DialogContext.Provider
      value={{ close: () => onOpenChange(false), titleId, descriptionId }}
    >
      <dialog
        ref={ref}
        className="native-dialog"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onCancel={(e) => {
          e.preventDefault();
          onOpenChange(false);
        }}
        onClose={() => {
          if (open) onOpenChange(false);
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onOpenChange(false);
        }}
      >
        {children}
      </dialog>
    </DialogContext.Provider>
  );
}
export function DialogContent({ children, ...props }: ContentProps) {
  const context = useContext(DialogContext);
  return (
    <div data-slot="dialog-content" {...props}>
      <button
        className="dialog-close"
        aria-label="Close dialog"
        onClick={context?.close}
      >
        ×
      </button>
      {children}
    </div>
  );
}
export function DialogTitle(props: HTMLAttributes<HTMLHeadingElement>) {
  const context = useContext(DialogContext);
  return <h2 id={context?.titleId} data-slot="dialog-title" {...props} />;
}
export function DialogDescription(props: HTMLAttributes<HTMLParagraphElement>) {
  const context = useContext(DialogContext);
  return (
    <p id={context?.descriptionId} data-slot="dialog-description" {...props} />
  );
}

// These small components compose the browser's native select, option and optgroup.
export function Select({
  value,
  onValueChange,
  disabled,
  children,
}: {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const parts = Children.toArray(children),
    trigger = parts.find((c) => isValidElement(c) && c.type === SelectTrigger),
    content = parts.find((c) => isValidElement(c) && c.type === SelectContent);
  const props = isValidElement<SelectHTMLAttributes<HTMLSelectElement>>(trigger)
    ? trigger.props
    : {};
  const { children: unused, ...rest } = props;
  void unused;
  return (
    <select
      {...rest}
      data-slot="select-trigger"
      value={value}
      disabled={disabled}
      onChange={(e) => onValueChange(e.target.value)}
    >
      {isValidElement<{ children: ReactNode }>(content)
        ? content.props.children
        : null}
    </select>
  );
}
export function SelectTrigger(_props: SelectHTMLAttributes<HTMLSelectElement>) {
  return null;
}
export function SelectValue() {
  return null;
}
export function SelectContent({
  children,
}: {
  children: ReactNode;
  className?: string;
  position?: string;
}) {
  return <>{children}</>;
}
export function SelectItem({
  value,
  children,
}: {
  value: string;
  children: ReactNode;
}) {
  return <option value={value}>{children}</option>;
}
export function SelectLabel(_props: { children: ReactNode }) {
  return null;
}
export function SelectGroup({ children }: { children: ReactNode }) {
  const parts = Children.toArray(children),
    label = parts.find((c) => isValidElement(c) && c.type === SelectLabel);
  return (
    <optgroup
      label={
        isValidElement<{ children: ReactNode }>(label)
          ? String(label.props.children)
          : ""
      }
    >
      {parts.filter((c) => !(isValidElement(c) && c.type === SelectLabel))}
    </optgroup>
  );
}
export function Slider({
  value,
  min,
  max,
  step,
  onValueChange,
  ...rest
}: {
  value: number[];
  min: number;
  max: number;
  step: number;
  onValueChange: (value: number[]) => void;
  "aria-label"?: string;
}) {
  return (
    <input
      {...rest}
      className="native-range"
      type="range"
      value={value[0]}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onValueChange([+e.target.value])}
    />
  );
}
export function SidebarProvider(props: ContentProps) {
  return <div data-slot="sidebar-wrapper" {...props} />;
}
export function Sidebar({
  collapsible,
  ...props
}: HTMLAttributes<HTMLElement> & { collapsible?: string }) {
  void collapsible;
  return <aside data-slot="sidebar" {...props} />;
}
export function SidebarContent(props: ContentProps) {
  return <div data-slot="sidebar-content" {...props} />;
}
export function SidebarGroup(props: ContentProps) {
  return (
    <nav data-slot="sidebar-group" aria-label="Workspace sections" {...props} />
  );
}
export function SidebarGroupLabel(props: ContentProps) {
  return <div data-slot="sidebar-group-label" {...props} />;
}
export function SidebarMenu(props: HTMLAttributes<HTMLUListElement>) {
  return <ul data-slot="sidebar-menu" {...props} />;
}
export function SidebarMenuItem(props: HTMLAttributes<HTMLLIElement>) {
  return <li data-slot="sidebar-menu-item" {...props} />;
}
export function SidebarMenuButton({
  isActive,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { isActive?: boolean }) {
  return (
    <button
      data-slot="sidebar-menu-button"
      data-active={Boolean(isActive)}
      aria-current={isActive ? "page" : undefined}
      {...props}
    />
  );
}
export function Table(props: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="table-scroll">
      <table data-slot="table" {...props} />
    </div>
  );
}
export function TableHeader(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead data-slot="table-header" {...props} />;
}
export function TableBody(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody data-slot="table-body" {...props} />;
}
export function TableRow(props: HTMLAttributes<HTMLTableRowElement>) {
  return <tr data-slot="table-row" {...props} />;
}
export function TableHead(props: HTMLAttributes<HTMLTableCellElement>) {
  return <th data-slot="table-head" scope="col" {...props} />;
}
export function TableCell(props: HTMLAttributes<HTMLTableCellElement>) {
  return <td data-slot="table-cell" {...props} />;
}
