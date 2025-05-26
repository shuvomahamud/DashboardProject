using Domain.Entities;
public class SheetConfig
{
    public int Id { get; set; }
    public string TableKey { get; set; } = null!;
    public string SheetUrl { get; set; } = null!;
    public DateTime UpdatedUtc { get; set; }
}
