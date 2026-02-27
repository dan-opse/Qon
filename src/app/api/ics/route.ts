import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    const url = request.nextUrl.searchParams.get('url');

    if (!url) {
        return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
    }

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'QTracker/1.0',
            },
        });

        if (!response.ok) {
            return NextResponse.json(
                { error: `Failed to fetch ICS: ${response.statusText}` },
                { status: response.status }
            );
        }

        const text = await response.text();
        return new NextResponse(text, {
            headers: { 'Content-Type': 'text/calendar' },
        });
    } catch (error) {
        return NextResponse.json(
            { error: `Fetch error: ${error instanceof Error ? error.message : 'Unknown'}` },
            { status: 500 }
        );
    }
}
