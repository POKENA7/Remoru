import type { Metadata } from "next";
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
		<html lang="en">
			<body>{children}</body>
		</html>
	);
}
