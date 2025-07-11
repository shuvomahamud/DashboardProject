import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const params = await context.params;
    const todo = await prisma.todo_list.findUnique({
      where: { taskid: parseInt(params.id) }
    });

    if (!todo) {
      return NextResponse.json({ error: 'Todo task not found' }, { status: 404 });
    }

    return NextResponse.json(todo);
  } catch (error) {
    console.error('Error fetching todo:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const params = await context.params;
    const body = await request.json();
    const { 
      taskname, category, assignedto, status, triggerdate, 
      internalduedate, actualduedate, nextduedate, 
      requiresfiling, filed, followupneeded, recurring, note 
    } = body;

    const todo = await prisma.todo_list.update({
      where: { taskid: parseInt(params.id) },
      data: {
        taskname,
        category,
        assignedto,
        status,
        triggerdate: triggerdate ? new Date(triggerdate) : null,
        internalduedate: internalduedate ? new Date(internalduedate) : null,
        actualduedate: actualduedate ? new Date(actualduedate) : null,
        nextduedate: nextduedate ? new Date(nextduedate) : null,
        requiresfiling: Boolean(requiresfiling),
        filed: Boolean(filed),
        followupneeded: Boolean(followupneeded),
        recurring: Boolean(recurring),
        note
      }
    });

    return NextResponse.json(todo);
  } catch (error) {
    console.error('Error updating todo:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const params = await context.params;
    await prisma.todo_list.delete({
      where: { taskid: parseInt(params.id) }
    });

    return NextResponse.json({ message: 'Todo task deleted successfully' });
  } catch (error) {
    console.error('Error deleting todo:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 