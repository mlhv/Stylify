import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

// White, rounded toasts in the brand ink and Nunito; the only floating thing
// that keeps a drop shadow.
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:rounded-2xl group-[.toaster]:border-2 group-[.toaster]:border-line group-[.toaster]:bg-white group-[.toaster]:font-sans group-[.toaster]:text-base group-[.toaster]:font-extrabold group-[.toaster]:text-ink group-[.toaster]:shadow-lg",
          description: "group-[.toast]:font-bold group-[.toast]:text-muted",
          actionButton: "group-[.toast]:bg-coral group-[.toast]:text-white",
          cancelButton: "group-[.toast]:bg-line group-[.toast]:text-ink",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
