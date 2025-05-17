namespace Domain.Entities;

public class TodoTask
{
    public int TaskId { get; set; }          // PK
    public string? Category { get; set; }
    public string? TaskName { get; set; }

    public DateTime? TriggerDateUtc { get; set; }
    public string? AssignedTo { get; set; }

    public DateTime? InternalDueDateUtc { get; set; }
    public DateTime? ActualDueDateUtc { get; set; }

    public string? Status { get; set; }
    public bool? RequiresFiling { get; set; }
    public bool? Filed { get; set; }
    public bool? FollowUpNeeded { get; set; }
    public bool? Recurring { get; set; }

    public DateTime? NextDueDateUtc { get; set; }
}
