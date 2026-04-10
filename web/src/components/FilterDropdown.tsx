import { ChevronDown, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export interface FilterOption<T extends string = string> {
  value: T
  label: string
}

interface FilterDropdownProps<T extends string = string> {
  label: string
  options: FilterOption<T>[]
  value: T
  onSelect: (value: T) => void
  /** Show the active option's label on the button instead of the fixed label. */
  showActive?: boolean
}

export default function FilterDropdown<T extends string = string>({
  label,
  options,
  value,
  onSelect,
  showActive = false,
}: FilterDropdownProps<T>) {
  const activeLabel = options.find(o => o.value === value)?.label

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-1.5">
          {showActive && activeLabel ? activeLabel : label}
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {options.map(opt => (
          <DropdownMenuItem
            key={opt.value}
            className="gap-2"
            onSelect={() => onSelect(opt.value)}
          >
            <Check className={`h-4 w-4 ${value === opt.value ? 'opacity-100' : 'opacity-0'}`} />
            {opt.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
