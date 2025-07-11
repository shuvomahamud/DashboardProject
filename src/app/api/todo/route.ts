import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  try {
    const todos = await prisma.todo_list.findMany({
      orderBy: { taskid: 'desc' }
    });
    return NextResponse.json(todos);
  } catch (error) {
    console.error("Error fetching todos:", error);
    return NextResponse.json({ error: "Failed to fetch todos" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const created = await prisma.todo_list.create({ 
      data: {
        category: data.category,
        taskname: data.taskname,
        triggerdate: data.triggerdate ? new Date(data.triggerdate) : null,
        assignedto: data.assignedto,
        internalduedate: data.internalduedate ? new Date(data.internalduedate) : null,
        actualduedate: data.actualduedate ? new Date(data.actualduedate) : null,
        status: data.status,
        requiresfiling: data.requiresfiling,
        filed: data.filed,
        followupneeded: data.followupneeded,
        recurring: data.recurring,
        nextduedate: data.nextduedate ? new Date(data.nextduedate) : null,
        note: data.note
      }
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("Error creating todo:", error);
    return NextResponse.json({ error: "Failed to create todo" }, { status: 500 });
  }
} 