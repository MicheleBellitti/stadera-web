/**
 * Authenticated app sidebar.
 *
 * Mobile: collapses to a top bar (the sidebar markup is hidden via `hidden`
 * media classes, top bar shows brand + nav links inline). Desktop:
 * permanent left sidebar.
 *
 * `usePathname` makes this a client component — without it we'd need to
 * pass the active route through context from the server layout, which
 * is more code for a page tree of four routes.
 */

"use client";

import { History, LineChart, LogOut, User, Weight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { API_URL } from "@/lib/api/client";
import { cn } from "@/lib/utils";

type NavItem = {
	href: string;
	label: string;
	icon: React.ComponentType<{ className?: string }>;
};

const NAV_ITEMS: NavItem[] = [
	{ href: "/dashboard", label: "Dashboard", icon: Weight },
	{ href: "/trend", label: "Trend", icon: LineChart },
	{ href: "/history", label: "History", icon: History },
	{ href: "/profile", label: "Profile", icon: User },
];

export function Sidebar() {
	const pathname = usePathname();

	return (
		<aside className="hidden md:flex md:w-60 md:flex-col md:border-r md:border-sidebar-border md:bg-sidebar md:text-sidebar-foreground">
			<div className="flex h-14 items-center px-6 border-b border-sidebar-border">
				<span className="text-lg font-semibold tracking-tight">Stadera</span>
			</div>

			<nav className="flex-1 px-3 py-4 space-y-1">
				{NAV_ITEMS.map((item) => {
					const Icon = item.icon;
					const active =
						pathname === item.href || pathname.startsWith(`${item.href}/`);
					return (
						<Link
							key={item.href}
							href={item.href}
							className={cn(
								"flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
								active
									? "bg-sidebar-accent text-sidebar-accent-foreground"
									: "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
							)}
						>
							<Icon className="size-4" />
							{item.label}
						</Link>
					);
				})}
			</nav>

			{/*
			 * Sign-out is a plain HTML POST to the backend's logout endpoint:
			 * the browser submits with cookies, the backend invalidates the
			 * session and 302s back to /, where the unauthenticated landing
			 * page renders.
			 */}
			<form
				action={`${API_URL}/auth/logout`}
				method="post"
				className="border-t border-sidebar-border p-3"
			>
				<button
					type="submit"
					className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
				>
					<LogOut className="size-4" />
					Sign out
				</button>
			</form>
		</aside>
	);
}

export function MobileBar() {
	const pathname = usePathname();

	return (
		<div className="md:hidden flex flex-col border-b border-border bg-background">
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
				{NAV_ITEMS.map((item) => {
					const Icon = item.icon;
					const active =
						pathname === item.href || pathname.startsWith(`${item.href}/`);
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
