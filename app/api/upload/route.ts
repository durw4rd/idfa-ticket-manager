import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import formidable from 'formidable';
import fs from 'fs/promises';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'File must be a PDF' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    
    // Upload to Vercel Blob
    const blob = await put(`tickets/${Date.now()}-${file.name}`, buffer, {
      access: 'public',
      contentType: 'application/pdf',
    });

    return NextResponse.json({ url: blob.url, filename: file.name });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}

