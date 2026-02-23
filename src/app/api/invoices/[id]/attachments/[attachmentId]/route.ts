import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { convexClient, api } from '@/lib/convex';

// GET - Download attachment
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, attachmentId } = await params;

    // Fetch attachment (includes storage URL)
    const attachment = await convexClient.query(api.invoiceAttachments.getById, {
      id: attachmentId as any,
    });

    if (!attachment || attachment.invoiceId !== id) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
    }

    // If we have a URL from Convex storage, redirect to it
    if (attachment.url) {
      const fileResponse = await fetch(attachment.url);
      const fileBuffer = await fileResponse.arrayBuffer();

      return new NextResponse(fileBuffer, {
        headers: {
          'Content-Type': attachment.mimeType,
          'Content-Disposition': `attachment; filename="${encodeURIComponent(attachment.filename)}"`,
          'Content-Length': attachment.size.toString(),
        },
      });
    }

    return NextResponse.json({ error: 'File data not available' }, { status: 404 });
  } catch (error) {
    console.error('Error downloading attachment:', error);
    return NextResponse.json(
      { error: 'Failed to download attachment' },
      { status: 500 }
    );
  }
}

// DELETE - Remove attachment
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check user role - only ADMIN or APPROVER can delete
    if (session.user.role !== 'ADMIN' && session.user.role !== 'APPROVER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id, attachmentId } = await params;

    // Check if attachment exists and belongs to the invoice
    const attachment = await convexClient.query(api.invoiceAttachments.getById, {
      id: attachmentId as any,
    });

    if (!attachment || attachment.invoiceId !== id) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
    }

    // Delete attachment (Convex remove handles storage cleanup)
    await convexClient.mutation(api.invoiceAttachments.remove, {
      id: attachmentId as any,
    });

    return NextResponse.json({ success: true, deleted: attachment.filename });
  } catch (error) {
    console.error('Error deleting attachment:', error);
    return NextResponse.json(
      { error: 'Failed to delete attachment' },
      { status: 500 }
    );
  }
}
