namespace Application.DTOs;

public record CsvLoadResult(int RowsInserted, int RowsFailed, string[]? Errors);
