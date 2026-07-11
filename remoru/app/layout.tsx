import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
	title: "Remoru",
	description: "Memo and spaced-repetition quiz app scaffold",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<ClerkProvider>
			<html lang="ja">
				<body>{children}</body>
			</html>
		</ClerkProvider>
	);
}
