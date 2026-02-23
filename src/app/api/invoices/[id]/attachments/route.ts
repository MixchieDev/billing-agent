import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { convexClient, api } from '@/lib/convex';

// File constraints
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB per file
const MAX_TOTAL_SIZE = 15 * 1024 * 1024; // 15MB total per invoice
const MAX_FILES = 5;
const ALLOWED_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'doc', 'docx', 'xls', 'xlsx'];

// GET - List attachments for an invoice
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Check if invoice exists
    const invoice = await convexClient.query(api.invoices.getById, {
      id: id as any,
    });

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Get attachments
    const attachments = await convexClient.query(api.invoiceAttachments.listByInvoiceId, {
      invoiceId: id as any,
    });

    // Transform for response (exclude data to reduce response size)
    const result = attachments.map((a: any) => ({
      id: a._id,
      filename: a.filename,
      mimeType: a.mimeType,
      size: a.size,
      uploadedAt: a.uploadedAt,
      uploadedBy: a.uploadedBy,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching attachments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch attachments' },
      { status: 500 }
    );
  }
}

// POST - Upload attachment
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check user role - only ADMIN or APPROVER can upload
    if (session.user.role !== 'ADMIN' && session.user.role !== 'APPROVER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;

    // Check if invoice exists
    const invoice = await convexClient.query(api.invoices.getById, {
      id: id as any,
    });

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Get existing attachments to check limits
    const existingAttachments = await convexClient.query(api.invoiceAttachments.listByInvoiceId, {
      invoiceId: id as any,
    });

    const currentCount = existingAttachments.length;
    const currentTotalSize = existingAttachments.reduce((sum: number, a: any) => sum + a.size, 0);

    if (currentCount >= MAX_FILES) {
      return NextResponse.json(
        { error: `Maximum ${MAX_FILES} attachments allowed per invoice` },
        { status: 400 }
      );
    }

    // Parse FormData
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    // Check total size limit
    if (currentTotalSize + file.size > MAX_TOTAL_SIZE) {
      return NextResponse.json(
        { error: `Total attachment size would exceed ${MAX_TOTAL_SIZE / 1024 / 1024}MB limit` },
        { status: 400 }
      );
    }

    // Validate file type by extension
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!extension || !ALLOWED_EXTENSIONS.includes(extension)) {
      return NextResponse.json(
        { error: `File type not allowed. Allowed types: ${ALLOWED_EXTENSIONS.join(', ')}` },
        { status: 400 }
      );
    }

    // Get upload URL from Convex storage
    const uploadUrl = await convexClient.mutation(api.invoiceAttachments.generateUploadUrl, {});

    // Upload file to Convex storage
    const arrayBuffer = await file.arrayBuffer();
    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Type': file.type || getMimeTypeFromExtension(extension),
      },
      body: arrayBuffer,
    });

    if (!uploadResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to upload file to storage' },
        { status: 500 }
      );
    }

    const { storageId } = await uploadResponse.json();

    // Create attachment record
    const mimeType = file.type || getMimeTypeFromExtension(extension);
    const attachmentId = await convexClient.mutation(api.invoiceAttachments.create, {
      invoiceId: id as any,
      filename: file.name,
      mimeType,
      size: file.size,
      storageId,
      uploadedBy: session.user.id,
    });

    const attachment = await convexClient.query(api.invoiceAttachments.getById, {
      id: attachmentId,
    });

    return NextResponse.json({
      id: attachment?._id,
      filename: attachment?.filename,
      mimeType: attachment?.mimeType,
      size: attachment?.size,
      uploadedAt: attachment?.uploadedAt,
      uploadedBy: attachment?.uploadedBy,
    }, { status: 201 });
  } catch (error) {
    console.error('Error uploading attachment:', error);
    return NextResponse.json(
      { error: 'Failed to upload attachment' },
      { status: 500 }
    );
  }
}

function getMimeTypeFromExtension(ext: string): string {
  const mimeMap: Record<string, string> = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  return mimeMap[ext] || 'application/octet-stream';
}
