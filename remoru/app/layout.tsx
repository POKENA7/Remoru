import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { RegisterServiceWorker } from "./register-sw";

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
				<head>
					<link rel="manifest" href="/manifest.json" />
				</head>
				<body>
					<RegisterServiceWorker />
					{children}
				</body>
			</html>
		</ClerkProvider>
	);
}
