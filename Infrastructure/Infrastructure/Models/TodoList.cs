using System;
using System.Collections.Generic;

namespace Infrastructure.Infrastructure.Models;

public partial class TodoList
{
    public int Taskid { get; set; }

    public string? Category { get; set; }

    public string? Taskname { get; set; }

    public DateOnly? Triggerdate { get; set; }

    public string? Assignedto { get; set; }

    public DateOnly? Internalduedate { get; set; }

    public DateOnly? Actualduedate { get; set; }

    public string? Status { get; set; }

    public bool? Requiresfiling { get; set; }

    public bool? Filed { get; set; }

    public bool? Followupneeded { get; set; }

    public bool? Recurring { get; set; }

    public DateOnly? Nextduedate { get; set; }
}
