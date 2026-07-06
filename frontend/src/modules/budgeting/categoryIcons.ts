/**
 * A curated set of lucide icons offered in the category icon picker. Only these
 * names are stored on `Category.icon`, so rendering a stored icon is a simple
 * lookup — no dynamic import by arbitrary string.
 */

import {
  Baby,
  Bus,
  Car,
  Coffee,
  CreditCard,
  Dumbbell,
  Film,
  Fuel,
  Gift,
  GraduationCap,
  Heart,
  Home,
  type LucideIcon,
  Music,
  PawPrint,
  Phone,
  PiggyBank,
  Plane,
  Shirt,
  ShoppingCart,
  Utensils,
  Wallet,
  Wifi,
  Zap,
} from "lucide-react";

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  ShoppingCart,
  Home,
  Car,
  Bus,
  Fuel,
  Utensils,
  Coffee,
  Plane,
  Heart,
  Gift,
  Zap,
  Wifi,
  Phone,
  Film,
  Music,
  Dumbbell,
  GraduationCap,
  Baby,
  PawPrint,
  Shirt,
  CreditCard,
  Wallet,
  PiggyBank,
};

/** Ordered icon names for the picker grid. */
export const CATEGORY_ICON_NAMES = Object.keys(CATEGORY_ICONS);

/** Resolve a stored icon name to its component, or undefined if unknown/empty. */
export function categoryIcon(name: string | null | undefined): LucideIcon | undefined {
  return name ? CATEGORY_ICONS[name] : undefined;
}
