/**
 * Authenticated app sidebar (desktop) + top bar (mobile).
 *
 * The sidebar groups nav items into sections so the user knows what's
 * "actionable" (Track) vs "configurable" (Settings). The active route
 * is highlighted with a brand-colored left border + subtle bg fill —
 * the standard "active-tab in a vertical nav" pattern from
 * Withings / Apple Health / Linear / Notion.
 *
 * The bottom of the sidebar carries an inline user identity card +
 * sign-out, so the user always knows whose data they're looking at.
 *
 * `usePathname` makes this a client component — without it we'd need
 * to pass the active route through context from the server layout,
 * which is more code for a five-route tree.
 */

"use client";

import { History, LineChart, LogOut, User, Weight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { API_URL } from "@/lib/api/client";
import { useMe } from "@/lib/api/queries";
import { cn } from "@/lib/utils";

type NavItem = {
	href: string;
	label: string;
	icon: React.ComponentType<{ className?: string }>;
};

type NavSection = {
	title: string;
	items: NavItem[];
};

const SECTIONS: NavSection[] = [
	{
		title: "Track",
		items: [
			{ href: "/dashboard", label: "Dashboard", icon: Weight },
			{ href: "/trend", label: "Trend", icon: LineChart },
			{ href: "/history", label: "History", icon: History },
		],
	},
	{
		title: "Settings",
		items: [{ href: "/profile", label: "Profile", icon: User }],
	},
];

const ALL_ITEMS = SECTIONS.flatMap((s) => s.items);

export function Sidebar() {
	const pathname = usePathname();
	const me = useMe();

	return (
		<aside className="hidden md:flex md:w-64 md:flex-col md:border-r md:border-sidebar-border md:bg-sidebar md:text-sidebar-foreground">
			<div className="flex flex-col gap-1 px-6 pt-6 pb-4 border-b border-sidebar-border">
				<span className="text-lg font-semibold tracking-tight">Stadera</span>
				<span className="text-xs text-muted-foreground">
					Personal weight tracking
				</span>
			</div>

			<nav className="flex-1 px-3 py-4 space-y-6 overflow-y-auto">
				{SECTIONS.map((section) => (
					<div key={section.title} className="space-y-1">
						<div className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
							{section.title}
						</div>
						{section.items.map((item) => (
							<NavLink
								key={item.href}
								item={item}
								active={isActive(pathname, item.href)}
							/>
						))}
					</div>
				))}
			</nav>

			<div className="border-t border-sidebar-border p-3 space-y-2">
				{me.data && (
					<div className="px-2 py-1.5 flex items-center gap-2 min-w-0">
						<div
							className="size-8 rounded-full bg-brand/15 text-brand flex items-center justify-center text-sm font-medium shrink-0"
							aria-hidden
						>
							{initials(me.data.name)}
						</div>
						<div className="flex flex-col min-w-0">
							<span className="text-sm font-medium truncate">
								{me.data.name}
							</span>
							<span className="text-xs text-muted-foreground truncate">
								{me.data.email}
							</span>
						</div>
					</div>
				)}
				<form action={`${API_URL}/auth/logout`} method="post">
					<button
						type="submit"
						className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
					>
						<LogOut className="size-4" />
						Sign out
					</button>
				</form>
			</div>
		</aside>
	);
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
	const Icon = item.icon;
	return (
		<Link
			href={item.href}
			className={cn(
				"relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
				active
					? "bg-sidebar-accent text-sidebar-accent-foreground"
					: "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
			)}
		>
			{active && (
				<span
					className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-r bg-sidebar-primary"
					aria-hidden
				/>
			)}
			<Icon className={cn("size-4", active && "text-sidebar-primary")} />
			{item.label}
		</Link>
	);
}

export function MobileBar() {
	const pathname = usePathname();

	return (
		<div className="md:hidden flex flex-col border-b border-border bg-card">
			<div className="flex h-12 items-center justify-between px-4 border-b border-border/60">
				<span className="text-base font-semibold tracking-tight">Stadera</span>
				<form action={`${API_URL}/auth/logout`} method="post">
					<button
						type="submit"
						aria-label="Sign out"
						className="text-sm text-muted-foreground hover:text-foreground"
					>
						<LogOut className="size-4" />
					</button>
				</form>
			</div>
			<nav className="flex overflow-x-auto px-2 py-2 gap-1">
				{ALL_ITEMS.map((item) => {
					const Icon = item.icon;
					const active = isActive(pathname, item.href);
					return (
						<Link
							key={item.href}
							href={item.href}
							className={cn(
								"flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
								active
									? "bg-accent text-accent-foreground"
									: "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
							)}
						>
							<Icon className="size-4" />
							{item.label}
						</Link>
					);
				})}
			</nav>
		</div>
	);
}

function isActive(pathname: string, href: string): boolean {
	return pathname === href || pathname.startsWith(`${href}/`);
}

function initials(name: string): string {
	return name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((s) => s[0]?.toUpperCase() ?? "")
		.join("");
}
