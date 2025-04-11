using System;

namespace Domain.Entities
{
    public class ToDoTask
    {
        public int Id { get; set; }
        public string TaskDescription { get; set; }
        public string AssignedTo { get; set; }
        public DateTime DueDate { get; set; }
        public string Status { get; set; }
        public string Priority { get; set; }
    }
}
