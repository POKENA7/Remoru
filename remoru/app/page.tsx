import Image from "next/image";

export default function Home() {
	return (
		<main className="page">
			<section className="card">
				<div className="brand">
					<Image src="/next.svg" alt="Next.js" width={160} height={32} priority />
					<span>Cloudflare Workers + OpenNext</span>
				</div>

				<h1>Remoru is ready.</h1>
				<p>The Next.js App Router starter is scaffolded and wired for Cloudflare Workers preview and deploy.</p>

				<ol>
					<li>
						Edit <code>app/page.tsx</code> to start building the app.
					</li>
					<li>
						Run <code>npm run dev</code> for local development.
					</li>
					<li>
						Run <code>npm run preview</code> to test the Workers runtime locally.
					</li>
				</ol>

				<div className="links">
					<a href="https://nextjs.org/docs" target="_blank" rel="noreferrer">
						<Image src="/file.svg" alt="" width={16} height={16} />
						Next.js docs
					</a>
					<a href="https://opennext.js.org/cloudflare" target="_blank" rel="noreferrer">
						<Image src="/globe.svg" alt="" width={16} height={16} />
						OpenNext docs
					</a>
				</div>
			</section>
		</main>
	);
}
