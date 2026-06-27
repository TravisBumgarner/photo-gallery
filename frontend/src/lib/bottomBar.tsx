import type { MaterialIcons } from '@expo/vector-icons';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react';

/** One left-side action in the shared bottom bar (screen-specific). */
export interface BottomBarItem {
  key: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  active?: boolean;
  onPress: () => void;
}

interface BottomBarContextValue {
  items: BottomBarItem[];
  setItems: (items: BottomBarItem[]) => void;
}

const BottomBarContext = createContext<BottomBarContextValue | null>(null);

// The bar itself lives once in the root layout so the menu button never
// remounts on navigation; only its left-side items change per screen. Screens
// publish those items through this provider.
export function BottomBarProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<BottomBarItem[]>([]);
  return (
    <BottomBarContext.Provider value={{ items, setItems }}>
      {children}
    </BottomBarContext.Provider>
  );
}

/** Read the active screen's bar items (used by the bar host). */
export function useBottomBarItems(): BottomBarItem[] {
  return useContext(BottomBarContext)?.items ?? [];
}

/**
 * Publish this screen's left-side bar actions. Pass a memoized array so the
 * effect only re-runs when the items actually change. There is deliberately no
 * unmount cleanup: the next screen overwrites the list, so the bar never blanks
 * mid-transition — the menu button stays put and nothing flashes.
 */
export function useSetBottomBarItems(items: BottomBarItem[]) {
  const setItems = useContext(BottomBarContext)?.setItems;
  useEffect(() => {
    setItems?.(items);
  }, [items, setItems]);
}
